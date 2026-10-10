use std::collections::HashMap;

use super::MonthlyActivityBucket;
use super::local_time::LocalClock;
use super::viewing_events::ViewingEventRow;
use crate::error::ApiError;

pub(super) struct MonthlyActivityRow {
    pub(super) month: String,
    pub(super) count: i64,
    pub(super) minutes: i64,
}

/// Counts events and sums their runtime per local month (`YYYY-MM`).
pub(super) fn bucket_by_local_month<'a>(
    events: impl IntoIterator<Item = &'a ViewingEventRow>,
    clock: &LocalClock,
) -> Result<Vec<MonthlyActivityRow>, ApiError> {
    let mut by_month: HashMap<String, (i64, i64)> = HashMap::new();
    for event in events {
        let entry = by_month
            .entry(clock.month_label(&event.watched_at)?)
            .or_insert((0, 0));
        entry.0 += 1;
        entry.1 += event.duration_minutes.unwrap_or(0);
    }
    Ok(by_month
        .into_iter()
        .map(|(month, (count, minutes))| MonthlyActivityRow {
            month,
            count,
            minutes,
        })
        .collect())
}

pub(super) fn zero_fill(
    rows: &[MonthlyActivityRow],
    month_labels: &[String],
) -> Vec<MonthlyActivityBucket> {
    let by_label: HashMap<String, &MonthlyActivityRow> =
        rows.iter().map(|row| (row.month.clone(), row)).collect();

    month_labels
        .iter()
        .map(|label| match by_label.get(label) {
            Some(row) => MonthlyActivityBucket {
                month: label.clone(),
                count: row.count,
                minutes: row.minutes,
            },
            None => MonthlyActivityBucket {
                month: label.clone(),
                count: 0,
                minutes: 0,
            },
        })
        .collect()
}
