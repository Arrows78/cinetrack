use super::MonthlyActivityBucket;

#[derive(sqlx::FromRow)]
pub(super) struct MonthlyActivityRow {
    pub(super) month: String,
    pub(super) count: i64,
    pub(super) minutes: Option<i64>,
}

pub(super) fn zero_fill(
    rows: &[MonthlyActivityRow],
    month_labels: &[String],
) -> Vec<MonthlyActivityBucket> {
    let by_label: std::collections::HashMap<String, &MonthlyActivityRow> =
        rows.iter().map(|row| (row.month.clone(), row)).collect();

    month_labels
        .iter()
        .map(|label| match by_label.get(label) {
            Some(row) => MonthlyActivityBucket {
                month: label.clone(),
                count: row.count,
                minutes: row.minutes.unwrap_or(0),
            },
            None => MonthlyActivityBucket {
                month: label.clone(),
                count: 0,
                minutes: 0,
            },
        })
        .collect()
}
