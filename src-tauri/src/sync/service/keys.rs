//! The `sync_metadata` keys a profile's sync bookkeeping lives under — one
//! place, so what is written while syncing and what `forget_profile` removes
//! when the profile is deleted cannot drift apart.

pub(super) const DEVICE_ID_KEY: &str = "deviceId";

pub(super) fn cursor_key(profile_id: &str) -> String {
    format!("cursor:{profile_id}")
}

pub(super) fn bootstrap_key(profile_id: &str) -> String {
    format!("bootstrap:{profile_id}")
}

pub(super) fn bootstrap_v2_key(profile_id: &str) -> String {
    format!("bootstrap:v2:{profile_id}")
}

pub(super) fn last_synced_key(profile_id: &str) -> String {
    format!("lastSyncedAt:{profile_id}")
}

pub(super) fn orphan_key_prefix(profile_id: &str) -> String {
    format!("orphan:{profile_id}:")
}
