mod commands;
#[cfg(test)]
mod concurrency_tests;
mod domain;
mod insert;
mod models;
mod queries;
mod repository;
mod rewatch_events;
mod service;
mod status;

pub use commands::{
    add_planned_library_item, get_best_recommendation_seed, get_library_item,
    get_library_items_by_keys, get_library_status_counts, get_random_library_item,
    has_library_item, list_completed_library_candidates, list_library, list_library_distinct_tags,
    list_library_ids_matching_filters, list_library_keys_among, list_library_media_keys,
    list_library_page, list_planned_library_candidates, list_stale_planned_library_items,
    refresh_library_catalog_metadata, remove_library_item, remove_planned_library_item,
    reset_library_status_to_auto, save_library_item,
};
pub(crate) use domain::{LibraryStatus, LibraryStatusOrigin};
pub(crate) use models::{AutoSyncMedia, LibraryItem, LibraryRow};
// Only used by stats::performance's benchmark, which is itself
// `#[cfg(test)]`-only — see that module's `timed_library_page`.
#[cfg(test)]
pub(crate) use models::LibraryMediaKey;
#[cfg(test)]
pub(crate) use models::LibrarySort;
#[cfg(test)]
pub(crate) use queries::explain_page_query;
pub(crate) use repository::{CreatedLibraryItem, UntouchedRemoval, remove_untouched_items_impl};
pub(crate) use rewatch_events::{cancel_series_rewatches_if_unseen, insert_rewatch_event};
pub(crate) use status::{StatusTrigger, reconcile_status_impl, reconcile_title_impl};

#[cfg(test)]
mod edge_case_tests;
#[cfg(test)]
mod multi_profile_tests;
#[cfg(test)]
mod sequence_tests;
#[cfg(test)]
mod stale_planned_tests;
#[cfg(test)]
mod status_flow_tests;
#[cfg(test)]
mod status_transitions_tests;
