use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub created_at: String,
    pub supabase_user_id: Option<String>,
}

#[derive(sqlx::FromRow)]
pub(crate) struct ProfileRow {
    pub(crate) uuid: String,
    pub(crate) name: String,
    pub(crate) avatar: Option<String>,
    pub(crate) created_at: String,
    pub(crate) supabase_user_id: Option<String>,
}

impl From<ProfileRow> for UserProfile {
    fn from(row: ProfileRow) -> Self {
        Self {
            id: row.uuid,
            name: row.name,
            avatar: row.avatar,
            created_at: row.created_at,
            supabase_user_id: row.supabase_user_id,
        }
    }
}
