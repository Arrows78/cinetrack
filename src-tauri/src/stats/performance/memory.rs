// Best-effort resident-set-size reading for the stress benchmark below —
// deliberately Linux-only (the CI job that records this runs on
// ubuntu-latest, see .github/workflows/ci.yml's "Record database
// performance baseline" step) rather than pulling in a cross-platform crate
// (sysinfo et al.) just for one debug metric that's already gated behind
// `if runner.os == 'Linux'`. Returns `None` anywhere else — local macOS/
// Windows dev runs still get every other stress metric, just not this one.

/// Parses the `VmRSS:` line out of a `/proc/[pid]/status`-shaped string —
/// pulled out as a pure function so the format can be unit-tested without
/// actually reading `/proc` (which doesn't exist outside Linux).
pub(super) fn parse_vm_rss_kb(status_contents: &str) -> Option<u64> {
    status_contents.lines().find_map(|line| {
        let rest = line.strip_prefix("VmRSS:")?;
        rest.trim().strip_suffix(" kB")?.trim().parse::<u64>().ok()
    })
}

#[cfg(target_os = "linux")]
pub(super) fn current_rss_bytes() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    parse_vm_rss_kb(&status).map(|kb| kb * 1024)
}

#[cfg(not(target_os = "linux"))]
pub(super) fn current_rss_bytes() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vm_rss_from_a_proc_status_shaped_string() {
        let status = "\
Name:\tcinetrack
VmPeak:\t  234567 kB
VmRSS:\t   123456 kB
VmHWM:\t   130000 kB
";
        assert_eq!(parse_vm_rss_kb(status), Some(123_456));
    }

    #[test]
    fn returns_none_when_the_line_is_missing() {
        let status = "Name:\tcinetrack\nVmPeak:\t  234567 kB\n";
        assert_eq!(parse_vm_rss_kb(status), None);
    }
}
