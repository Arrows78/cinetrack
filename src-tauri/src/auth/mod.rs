// Desktop-only: macOS cannot register `cinetrack://` at runtime, and
// `pnpm tauri dev` never produces the `.app` bundle Launch Services
// needs. OAuth therefore returns through a loopback HTTP server (RFC 8252)
// instead of the custom scheme. See oauth_callback.rs.

mod oauth_callback;

pub use oauth_callback::start_oauth_callback_server;
