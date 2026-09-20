mod commands;
mod models;
mod repository;
mod service;

pub use commands::{
    clear_profile_pin, create_profile, find_profile_by_supabase_user_id,
    link_profile_to_supabase_user, list_profiles, remove_profile,
    resolve_profile_for_supabase_user, set_profile_pin, update_profile, verify_profile_pin,
};
pub(crate) use models::{ProfileRow, UserProfile};
pub(crate) use repository::get_by_id_impl;
