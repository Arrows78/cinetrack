use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub created_at: String,
    /// The linked identity provider account id — despite the name, no
    /// longer specifically a Supabase Auth id: since the Clerk migration
    /// (see docs/auth.md) this holds Clerk's `sub` claim ("user_xxx",
    /// a string, never a UUID). Left unrenamed deliberately: renaming
    /// would also touch the SQLite migration, every Tauri command name
    /// below, and the literal `"supabase_user_id"` JSON key backup exports
    /// already use (see backup/repository.rs) — see docs/auth.md's Clerk
    /// migration section for why that trade wasn't taken.
    pub supabase_user_id: Option<String>,
    /// Derived from `ProfileRow.pin_hash` — whether this profile has an
    /// optional PIN lock set. The hash/salt themselves never leave the
    /// backend (see `ProfileRow`), only this boolean.
    pub has_pin: bool,
}

#[derive(sqlx::FromRow)]
pub(crate) struct ProfileRow {
    pub(crate) uuid: String,
    pub(crate) name: String,
    pub(crate) avatar: Option<String>,
    pub(crate) created_at: String,
    pub(crate) supabase_user_id: Option<String>,
    pub(crate) pin_hash: Option<String>,
    // Only read via the raw `SELECT pin_hash, pin_salt` in
    // repository::verify_pin_impl, never through this struct — kept here
    // so `SELECT *`'s `sqlx::FromRow` mapping (list_impl, get_by_id_impl)
    // stays in sync with every column the `profiles` table actually has.
    #[allow(dead_code)]
    pub(crate) pin_salt: Option<String>,
}

impl From<ProfileRow> for UserProfile {
    fn from(row: ProfileRow) -> Self {
        Self {
            id: row.uuid,
            name: row.name,
            avatar: row.avatar,
            created_at: row.created_at,
            supabase_user_id: row.supabase_user_id,
            has_pin: row.pin_hash.is_some(),
        }
    }
}
