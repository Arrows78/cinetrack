pub(super) mod activity;
pub(super) mod forecast;
pub(super) mod library_extras;
pub(super) mod milestones;
pub(super) mod monthly_activity;
pub(super) mod overview;
pub(super) mod ratings;
pub(super) mod recap;
pub(super) mod rewatch;
pub(super) mod viewing_events;

pub use viewing_events::{ViewingEvent, ViewingEventNote, ViewingEventType};

// Query modules historically imported their DTOs from `super`. Keep that
// relationship local to the query layer while the canonical DTO definitions
// live in stats/models.rs.
pub(super) use super::models::*;
