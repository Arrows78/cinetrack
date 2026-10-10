//! The viewer's local calendar, for every statistic that buckets by day,
//! month, year, weekday or hour.
//!
//! SQLite has no time-zone database, so the bucketing happens here, on the
//! rows `active_events` returns.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, Utc};

use crate::error::ApiError;

/// Parses a stored or client-supplied instant. The app writes RFC 3339
/// (`2026-03-01T10:00:00.000Z`); a zone-less date-time (as some imported
/// data carries) is read as UTC, and a bare date as UTC midnight.
pub(in crate::stats) fn parse_instant(value: &str) -> Result<DateTime<Utc>, ApiError> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Ok(parsed.with_timezone(&Utc));
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%d %H:%M:%S%.f"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(value, format) {
            return Ok(naive.and_utc());
        }
    }
    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        && let Some(naive) = date.and_hms_opt(0, 0, 0)
    {
        return Ok(naive.and_utc());
    }
    Err(ApiError::internal(format!(
        "Malformed date in the viewing history: '{value}'"
    )))
}

/// Converts instants to the viewer's local wall-clock time.
#[derive(Debug, Clone, Copy)]
pub(in crate::stats) struct LocalClock {
    /// JS's `Date.getTimezoneOffset()`: UTC minus local, in minutes.
    offset_minutes: i64,
}

impl From<i64> for LocalClock {
    fn from(offset_minutes: i64) -> Self {
        Self::from_offset_minutes(offset_minutes)
    }
}

impl LocalClock {
    pub(in crate::stats) fn from_offset_minutes(offset_minutes: i64) -> Self {
        Self { offset_minutes }
    }

    pub(in crate::stats) fn local(&self, instant: &str) -> Result<NaiveDateTime, ApiError> {
        let utc = parse_instant(instant)?;
        Ok(utc.naive_utc() - Duration::minutes(self.offset_minutes))
    }

    pub(in crate::stats) fn day(&self, instant: &str) -> Result<NaiveDate, ApiError> {
        Ok(self.local(instant)?.date())
    }

    /// `YYYY-MM`.
    pub(in crate::stats) fn month_label(&self, instant: &str) -> Result<String, ApiError> {
        Ok(self.local(instant)?.format("%Y-%m").to_string())
    }
}
