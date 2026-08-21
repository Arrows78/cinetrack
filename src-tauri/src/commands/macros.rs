/// Generates a `#[tauri::command]` that resolves the active profile and
/// forwards it, plus every declared argument unchanged and in order, to
/// `$impl_fn(&pool, &profile_id, ...)` — the exact
/// `let profile_id = current_profile_id(&pool).await?;` + delegate shape
/// repeated across nearly every read/write command in this module.
///
/// Only fits commands where every argument is passed to the impl fn by
/// value, in declared order, with no transform. Commands that need a `&`
/// (an impl taking `&str`/`&[T]` to avoid a clone) or a transform (e.g.
/// `patch.unwrap_or_default()`) are written out by hand instead — see
/// `save_library_item`/`create_custom_list`/`list_recent_viewing_events` for
/// examples of why.
macro_rules! profile_scoped_command {
    (
        $(#[$meta:meta])*
        pub async fn $name:ident($($arg:ident: $arg_ty:ty),* $(,)?) -> $ret:ty => $impl_fn:ident
    ) => {
        $(#[$meta])*
        #[tauri::command]
        pub async fn $name(
            $($arg: $arg_ty,)*
            pool: tauri::State<'_, sqlx::SqlitePool>,
        ) -> Result<$ret, crate::error::ApiError> {
            let profile_id = crate::database::current_profile_id(&pool).await?;
            // `&*pool` (not `&pool`) so this deref-coerces `State<SqlitePool>`
            // to a concrete `&SqlitePool` before the call — required for
            // `_impl` fns generic over `sqlx::Executor` (e.g.
            // is_movie_seen_impl), since Rust doesn't apply deref coercion
            // through generic type inference the way it does for a
            // concretely-typed parameter.
            $impl_fn(&*pool, &profile_id, $($arg),*).await
        }
    };
}

pub(crate) use profile_scoped_command;
