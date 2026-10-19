use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime};

// Keep in sync with `DESKTOP_OAUTH_LOOPBACK_URL` in
// `src/features/auth/auth-client.ts`.
const LISTEN_ADDR: &str = "127.0.0.1:7420";
/// How long an accepted connection may stay silent: a client that connects and
/// sends nothing must not hold on to a thread (or, were connections served one
/// by one, block the sign-in callback behind it).
const READ_TIMEOUT: Duration = Duration::from_secs(2);
const CALLBACK_PATH: &str = "/auth/callback";
const SUCCESS_HTML: &str = "<!DOCTYPE html>\
<html lang=\"en\"><head><meta charset=\"utf-8\"><title>CineTrack</title></head>\
<body style=\"font-family:system-ui,sans-serif;padding:2rem;line-height:1.5\">\
<p>You can return to CineTrack. This tab can be closed.</p>\
<p>Vous pouvez revenir a CineTrack. Cet onglet peut etre ferme.</p>\
</body></html>";

/// Binds the OAuth loopback port and emits each Clerk callback on
/// `cinetrack:deep-link` so the login screen can finish `signIn.reload`.
pub fn start_oauth_callback_server<R: Runtime>(app: AppHandle<R>) {
    std::thread::Builder::new()
        .name("oauth-callback".into())
        .spawn(move || listen_loop(app))
        .ok();
}

fn listen_loop<R: Runtime>(app: AppHandle<R>) {
    let listener = match TcpListener::bind(LISTEN_ADDR) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("oauth callback server failed to bind {LISTEN_ADDR}: {error}");
            return;
        }
    };

    // One thread per connection, so a silent client never delays the real
    // callback behind it.
    for stream in listener.incoming().flatten() {
        let app = app.clone();
        std::thread::Builder::new()
            .name("oauth-callback-conn".into())
            .spawn(move || handle_connection(stream, &app))
            .ok();
    }
}

/// Reads the start of the request, giving up after `timeout` of silence.
fn read_request(stream: &mut TcpStream, timeout: Duration) -> Option<String> {
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;
    let mut buffer = [0_u8; 8192];
    match stream.read(&mut buffer) {
        Ok(read) if read > 0 => Some(String::from_utf8_lossy(&buffer[..read]).into_owned()),
        _ => None,
    }
}

fn handle_connection<R: Runtime>(mut stream: TcpStream, app: &AppHandle<R>) {
    let Some(request) = read_request(&mut stream, READ_TIMEOUT) else {
        return;
    };
    let Some(callback_url) = callback_url_from_request(&request) else {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        return;
    };

    let _ = app.emit("cinetrack:deep-link", callback_url);
    focus_main_window(app);

    let body = SUCCESS_HTML.as_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
}

fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn callback_url_from_request(request: &str) -> Option<String> {
    let line = request.lines().next()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;

    if !method.eq_ignore_ascii_case("GET") && !method.eq_ignore_ascii_case("HEAD") {
        return None;
    }

    let path = target.split('?').next().unwrap_or(target);
    let normalized = path.trim_end_matches('/');
    if normalized != CALLBACK_PATH {
        return None;
    }

    Some(format!("http://{LISTEN_ADDR}{target}"))
}

#[cfg(test)]
mod tests {
    use super::{callback_url_from_request, read_request};
    use std::net::{TcpListener, TcpStream};
    use std::time::{Duration, Instant};

    #[test]
    fn a_silent_client_is_given_up_on_after_the_timeout() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let _silent = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (mut accepted, _) = listener.accept().unwrap();

        let started = Instant::now();
        assert_eq!(
            read_request(&mut accepted, Duration::from_millis(100)),
            None
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn accepts_get_callback_with_nonce() {
        let request =
            "GET /auth/callback?rotating_token_nonce=abc HTTP/1.1\r\nHost: 127.0.0.1:7420\r\n\r\n";
        assert_eq!(
            callback_url_from_request(request).as_deref(),
            Some("http://127.0.0.1:7420/auth/callback?rotating_token_nonce=abc")
        );
    }

    #[test]
    fn accepts_trailing_slash() {
        let request = "GET /auth/callback/ HTTP/1.1\r\n\r\n";
        assert_eq!(
            callback_url_from_request(request).as_deref(),
            Some("http://127.0.0.1:7420/auth/callback/")
        );
    }

    #[test]
    fn rejects_other_paths_and_methods() {
        assert_eq!(
            callback_url_from_request("GET /other?rotating_token_nonce=abc HTTP/1.1\r\n\r\n"),
            None
        );
        assert_eq!(
            callback_url_from_request(
                "POST /auth/callback?rotating_token_nonce=abc HTTP/1.1\r\n\r\n"
            ),
            None
        );
    }
}
