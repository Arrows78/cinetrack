mod commands;
mod domain;
mod models;
mod queries;
mod repository;
mod service;

pub use commands::{
    get_episode_progress, is_movie_seen, list_tracked_series, refresh_tracked_series_status,
    toggle_episodes_watched, toggle_movie_seen,
};
pub(crate) use models::{EpisodeInput, EpisodeProgress, SeriesInput, TrackedSeriesItem};

// The TV Time importer intentionally reuses the exact same transactional
// episode upsert/rollup implementation without exposing it over Tauri.
pub(crate) use repository::apply_episodes_impl;
