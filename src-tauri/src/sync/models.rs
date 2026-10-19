use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutboxMutation {
    pub mutation_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: Option<serde_json::Value>,
    pub base_version: i64,
    pub created_at: String,
    pub attempt_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMutationAck {
    pub mutation_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub version: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub mutation_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub server_version: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSyncChange {
    pub sequence: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub version: i64,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictDetail {
    pub mutation_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub device_id: String,
    pub cursor: i64,
    pub pending_count: i64,
    pub failed_count: i64,
    pub conflict_count: i64,
    pub last_synced_at: Option<String>,
}
