use sqlx::SqlitePool;

use super::models::ViewingHistoryItem;
use super::repository::list_history_impl;
use crate::error::ApiError;

pub(super) struct HistoryService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> HistoryService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub(super) async fn list(
        &self,
        limit: u32,
        before: Option<(&str, &str)>,
    ) -> Result<Vec<ViewingHistoryItem>, ApiError> {
        list_history_impl(self.pool, limit, before).await
    }
}
