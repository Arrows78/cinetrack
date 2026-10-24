//! The instants the app stores (`watched_at`, ...): RFC 3339, as
//! `new Date().toISOString()` and SQLite's `now_iso` write them. One parser
//! for everything that reads or validates them, so a date a writer accepts is
//! always a date the statistics can read back.

use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};

use crate::error::ApiError;

/// Parses a stored or client-supplied instant. RFC 3339 is what the app
/// writes; a zone-less date-time (as some imported data carries) is read as
/// UTC, and a bare date as UTC midnight.
pub fn parse_instant(value: &str) -> Option<DateTime<Utc>> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Some(parsed.with_timezone(&Utc));
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%d %H:%M:%S%.f"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(value, format) {
            return Some(naive.and_utc());
        }
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .map(|naive| naive.and_utc())
}

/// Refuses an instant the statistics could not read: one unreadable
/// `watched_at` in the log would make every statistic fail, with no way for
/// the viewer to get rid of the row.
pub fn require_instant(value: &str) -> Result<DateTime<Utc>, ApiError> {
    parse_instant(value)
        .ok_or_else(|| ApiError::bad_request(format!("Not a valid date and time: '{value}'")))
}

/// Validates an instant and returns it in the one form the database stores:
/// RFC 3339, UTC, millisecond precision (`2026-03-01T10:00:00.000Z`). SQL
/// compares and sorts these as strings, which is only right when every
/// stored instant has the same shape. An already-canonical value comes back
/// byte-identical.
pub fn canonical_instant(value: &str) -> Result<String, ApiError> {
    Ok(require_instant(value)?.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// How far past "now" a viewing date a user logs may be: a day covers the
/// time zones and the clock drift between two devices. Anything later is a
/// typo or a hand-built call, and would break "current streak" and the
/// pace forecast (their runs end at today or yesterday).
const FUTURE_TOLERANCE_HOURS: i64 = 24;

/// `canonical_instant` for a date a user logs a viewing at: also refuses a
/// date more than a day in the future. Imports, restores and cloud pulls keep
/// using `canonical_instant`, which only checks that the date is readable.
pub fn canonical_viewing_instant(value: &str) -> Result<String, ApiError> {
    let instant = require_instant(value)?;
    if instant > Utc::now() + chrono::Duration::hours(FUTURE_TOLERANCE_HOURS) {
        return Err(ApiError::bad_request(
            "A viewing cannot be dated in the future",
        ));
    }
    Ok(instant.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// The longest note kept on one viewing.
pub const MAX_NOTE_CHARS: usize = 2000;

/// Trims a viewing note to nothing-or-text and refuses an oversized one: the
/// note is stored once per event, and exported and synced with it.
pub fn bounded_note(note: Option<String>) -> Result<Option<String>, ApiError> {
    match note {
        Some(text) if text.chars().count() > MAX_NOTE_CHARS => Err(ApiError::bad_request(format!(
            "A note is limited to {MAX_NOTE_CHARS} characters"
        ))),
        other => Ok(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_form_is_utc_with_millis_and_stable_for_canonical_input() {
        for (input, expected) in [
            ("2026-03-01T10:00:00.000Z", "2026-03-01T10:00:00.000Z"),
            ("2026-03-01T11:00:00+01:00", "2026-03-01T10:00:00.000Z"),
            ("2026-03-01T10:00:00", "2026-03-01T10:00:00.000Z"),
            ("2026-03-01 10:00:00.5", "2026-03-01T10:00:00.500Z"),
            ("2026-03-01", "2026-03-01T00:00:00.000Z"),
        ] {
            assert_eq!(canonical_instant(input).unwrap(), expected, "{input}");
        }
        assert_eq!(canonical_instant("nope").unwrap_err().status, Some(400));
    }

    #[test]
    fn reads_what_the_app_writes_and_the_zone_less_forms_imports_carry() {
        for value in [
            "2026-03-01T10:00:00.000Z",
            "2026-03-01T11:00:00+01:00",
            "2026-03-01T10:00:00",
            "2026-03-01 10:00:00.5",
            "2026-03-01",
        ] {
            assert!(parse_instant(value).is_some(), "{value}");
        }
    }

    #[test]
    fn a_viewing_may_be_today_or_past_but_not_days_ahead() {
        let now = Utc::now();
        let day = chrono::Duration::days(1);
        let ok = |at: DateTime<Utc>| canonical_viewing_instant(&at.to_rfc3339()).is_ok();
        assert!(ok(now));
        assert!(ok(now - day * 400));
        assert!(
            ok(now + chrono::Duration::hours(12)),
            "time zones and drift"
        );
        assert!(!ok(now + day * 3));
        assert_eq!(
            canonical_viewing_instant("2999-01-01T00:00:00Z")
                .unwrap_err()
                .status,
            Some(400)
        );
    }

    #[test]
    fn an_oversized_note_is_refused() {
        assert!(bounded_note(None).unwrap().is_none());
        assert!(bounded_note(Some("a".repeat(MAX_NOTE_CHARS))).is_ok());
        assert_eq!(
            bounded_note(Some("a".repeat(MAX_NOTE_CHARS + 1)))
                .unwrap_err()
                .status,
            Some(400)
        );
    }

    #[test]
    fn refuses_what_is_not_a_date() {
        for value in ["", "now", "garbage", "2026-13-01T00:00:00Z", "2026-02-30"] {
            assert!(parse_instant(value).is_none(), "{value}");
            assert_eq!(require_instant(value).unwrap_err().status, Some(400));
        }
    }
}
