use tauri::State;

use crate::database::BootRecovery;

/// Whether `init_pool` had to quarantine a broken database file and start
/// fresh on this launch (see `database::init_pool`'s own doc comment) — read
/// once at startup so the frontend can offer to restore the last automatic
/// backup instead of silently showing an empty app with no explanation.
#[tauri::command]
pub fn get_boot_recovery(boot_recovery: State<'_, BootRecovery>) -> BootRecovery {
    boot_recovery.inner().clone()
}
