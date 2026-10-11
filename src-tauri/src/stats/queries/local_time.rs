//! The viewer's local calendar, for every statistic that buckets by day,
//! month, year, weekday or hour.
//!
//! SQLite has no time-zone database, so the bucketing happens here, on the
//! rows `active_events` returns.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, Utc};
use chrono_tz::Tz;

use crate::error::ApiError;

/// Parses a stored instant (see `crate::database::parse_instant`).
pub(in crate::stats) fn parse_instant(value: &str) -> Result<DateTime<Utc>, ApiError> {
    crate::database::parse_instant(value).ok_or_else(|| {
        ApiError::internal(format!("Malformed date in the viewing history: '{value}'"))
    })
}

/// Converts instants to the viewer's local wall-clock time.
///
/// Normally a real IANA time zone (`Europe/Paris`): every event is converted
/// with the offset that zone had *at that event's own instant*, daylight
/// saving included, so a watch from the other half of the year lands on the
/// right hour, day, month and year. A client that cannot name its zone falls
/// back to a single fixed offset (JS's `Date.getTimezoneOffset()` of one
/// instant), which is only exact for the part of the year that offset was
/// read in.
#[derive(Debug, Clone, Copy)]
pub(in crate::stats) enum LocalClock {
    /// JS's `Date.getTimezoneOffset()`: UTC minus local, in minutes.
    FixedOffset {
        offset_minutes: i64,
    },
    Zone(Tz),
}

impl From<i64> for LocalClock {
    fn from(offset_minutes: i64) -> Self {
        Self::from_offset_minutes(offset_minutes)
    }
}

impl LocalClock {
    pub(in crate::stats) fn from_offset_minutes(offset_minutes: i64) -> Self {
        Self::FixedOffset { offset_minutes }
    }

    /// What a stats command was asked for: the IANA zone when the client
    /// sent one (validated here — an unknown or empty identifier is a 400,
    /// never a silent fallback), else the legacy fixed offset.
    pub(in crate::stats) fn from_request(
        offset_minutes: i64,
        time_zone: Option<&str>,
    ) -> Result<Self, ApiError> {
        match time_zone {
            None => Ok(Self::from_offset_minutes(offset_minutes)),
            Some(name) => name.parse::<Tz>().map(Self::Zone).map_err(|_| {
                ApiError::bad_request(format!("Unknown IANA time zone identifier: '{name}'"))
            }),
        }
    }

    pub(in crate::stats) fn local(&self, instant: &str) -> Result<NaiveDateTime, ApiError> {
        let utc = parse_instant(instant)?;
        Ok(match self {
            Self::FixedOffset { offset_minutes } => {
                utc.naive_utc() - Duration::minutes(*offset_minutes)
            }
            Self::Zone(zone) => utc.with_timezone(zone).naive_local(),
        })
    }

    pub(in crate::stats) fn day(&self, instant: &str) -> Result<NaiveDate, ApiError> {
        Ok(self.local(instant)?.date())
    }

    /// `YYYY-MM`.
    pub(in crate::stats) fn month_label(&self, instant: &str) -> Result<String, ApiError> {
        Ok(self.local(instant)?.format("%Y-%m").to_string())
    }
}
