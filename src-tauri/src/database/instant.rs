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
    fn refuses_what_is_not_a_date() {
        for value in ["", "now", "garbage", "2026-13-01T00:00:00Z", "2026-02-30"] {
            assert!(parse_instant(value).is_none(), "{value}");
            assert_eq!(require_instant(value).unwrap_err().status, Some(400));
        }
    }
}
