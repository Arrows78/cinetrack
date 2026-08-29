mod commands;
mod models;
mod repository;
mod service;

pub use commands::list_history;
pub(crate) use models::{HistoryAction, HistoryRow, ViewingHistoryItem};
pub(crate) use repository::add_history_item_impl;
// Only other domains' own tests reach for this (see library/repository.rs's
// tests) — HistoryService::list calls repository::list_history_impl
// directly and never needs it re-exported for production code.
#[cfg(test)]
pub(crate) use repository::list_history_impl;
