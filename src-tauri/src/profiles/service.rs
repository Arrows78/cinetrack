use sqlx::SqlitePool;

use super::models::UserProfile;
use super::repository::{
    clear_pin_impl, create_impl, find_by_supabase_user_id_impl, link_to_supabase_user_impl,
    list_impl, remove_impl, resolve_for_supabase_user_impl, set_pin_impl, update_impl,
    verify_pin_impl,
};
use crate::error::ApiError;

pub(super) struct ProfileService<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ProfileService<'a> {
    pub(super) fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub(super) async fn list(&self) -> Result<Vec<UserProfile>, ApiError> {
        list_impl(self.pool).await
    }

    pub(super) async fn create(
        &self,
        name: &str,
        avatar: Option<String>,
        supabase_user_id: Option<String>,
    ) -> Result<UserProfile, ApiError> {
        create_impl(self.pool, name, avatar, supabase_user_id).await
    }

    pub(super) async fn find_by_supabase_user_id(
        &self,
        supabase_user_id: &str,
    ) -> Result<Option<UserProfile>, ApiError> {
        find_by_supabase_user_id_impl(self.pool, supabase_user_id).await
    }

    pub(super) async fn link_to_supabase_user(
        &self,
        profile_id: &str,
        supabase_user_id: &str,
    ) -> Result<UserProfile, ApiError> {
        link_to_supabase_user_impl(self.pool, profile_id, supabase_user_id).await
    }

    pub(super) async fn resolve_for_supabase_user(
        &self,
        supabase_user_id: &str,
    ) -> Result<Option<UserProfile>, ApiError> {
        resolve_for_supabase_user_impl(self.pool, supabase_user_id).await
    }

    pub(super) async fn update(
        &self,
        profile_id: &str,
        name: &str,
        avatar: Option<String>,
    ) -> Result<UserProfile, ApiError> {
        update_impl(self.pool, profile_id, name, avatar).await
    }

    pub(super) async fn remove(&self, profile_id: &str) -> Result<(), ApiError> {
        remove_impl(self.pool, profile_id).await
    }

    pub(super) async fn set_pin(
        &self,
        profile_id: &str,
        pin: &str,
    ) -> Result<UserProfile, ApiError> {
        set_pin_impl(self.pool, profile_id, pin).await
    }

    pub(super) async fn clear_pin(&self, profile_id: &str) -> Result<UserProfile, ApiError> {
        clear_pin_impl(self.pool, profile_id).await
    }

    pub(super) async fn verify_pin(&self, profile_id: &str, pin: &str) -> Result<bool, ApiError> {
        verify_pin_impl(self.pool, profile_id, pin).await
    }
}
