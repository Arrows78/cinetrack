//! The PIN lock of a profile: how a PIN is hashed, and how wrong guesses are
//! slowed down. A 4-6 digit PIN has at most a million values, so the hash
//! alone is not what protects it: every attempt is counted in the database and
//! the backend refuses further ones for a growing delay (see
//! [`reserve_attempt`]). Everything that checks a PIN goes through
//! [`check_pin`], so there is one counter and no path around it.

use std::fmt::Write as _;
use std::time::Duration;

use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::database::{now_iso, parse_instant};
use crate::error::ApiError;

/// Attempts allowed since the last correct PIN before the first lock.
pub(super) const FREE_ATTEMPTS: i64 = 5;
/// The first lock; every further attempt doubles it, up to [`MAX_LOCK_SECONDS`].
const BASE_LOCK_SECONDS: i64 = 30;
const MAX_LOCK_SECONDS: i64 = 900;

const ARGON2_PREFIX: &str = "$argon2id$";

/// OWASP's second Argon2id profile (19 MiB, 2 passes, 1 lane). Tests use the
/// smallest legal one: the parameters are written into every hash, so a hash
/// made with either still verifies with the other.
#[cfg(not(test))]
fn argon2_config() -> argon2::Config<'static> {
    argon2::Config::owasp2()
}

#[cfg(test)]
fn argon2_config() -> argon2::Config<'static> {
    argon2::Config {
        mem_cost: 8,
        time_cost: 1,
        ..argon2::Config::owasp2()
    }
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// A new PIN's `(pin_hash, pin_salt)`: an Argon2id encoded hash, and its salt
/// hex-encoded (the salt is also inside the hash string; the column only has
/// to be non-null, which is what "a PIN is set" means).
pub(super) fn hash_new_pin(pin: &str) -> Result<(String, String), ApiError> {
    let salt = *uuid::Uuid::new_v4().as_bytes();
    let encoded = argon2::hash_encoded(pin.as_bytes(), &salt, &argon2_config())
        .map_err(|error| ApiError::internal(format!("Could not hash the PIN: {error}")))?;
    Ok((encoded, hex(&salt)))
}

/// The scheme PINs were stored with before Argon2id: sha256(salt + pin), hex.
fn legacy_hash(pin: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(pin.as_bytes());
    hex(&hasher.finalize())
}

/// Compares in time that does not depend on where the first difference is.
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn is_legacy(stored_hash: &str) -> bool {
    !stored_hash.starts_with(ARGON2_PREFIX)
}

fn matches(pin: &str, stored_hash: &str, salt: &str) -> bool {
    if is_legacy(stored_hash) {
        constant_time_eq(legacy_hash(pin, salt).as_bytes(), stored_hash.as_bytes())
    } else {
        // `verify_encoded` compares the digests in constant time itself; a
        // malformed stored string simply never matches.
        argon2::verify_encoded(stored_hash, pin.as_bytes()).unwrap_or(false)
    }
}

/// How long the caller has to wait, when the profile is locked right now.
async fn remaining_lock(pool: &SqlitePool, profile_id: &str) -> Result<Option<Duration>, ApiError> {
    let locked_until: Option<(Option<String>,)> =
        sqlx::query_as("SELECT pin_locked_until FROM profiles WHERE uuid = $1")
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    let Some((Some(until),)) = locked_until else {
        return Ok(None);
    };
    let Some(until) = parse_instant(&until) else {
        return Ok(None);
    };
    Ok((until - Utc::now()).to_std().ok())
}

fn locked_error(remaining: Duration) -> ApiError {
    let seconds = remaining.as_secs() + 1;
    ApiError::with_status(
        format!("Too many PIN attempts. Try again in {seconds} seconds."),
        429,
    )
}

/// Counts one attempt, atomically, before it is judged — so concurrent
/// guesses cannot each read the same counter. Returns false (no row touched)
/// when the profile is locked right now. Reaching [`FREE_ATTEMPTS`] sets the
/// lock that refuses the *following* attempts; each one after that doubles it.
async fn reserve_attempt(pool: &SqlitePool, profile_id: &str) -> Result<bool, ApiError> {
    let now = now_iso(pool).await?;
    let reserved = sqlx::query(
        "UPDATE profiles SET
           pin_failed_attempts = pin_failed_attempts + 1,
           pin_locked_until = CASE
             WHEN pin_failed_attempts + 1 >= $2 THEN strftime('%Y-%m-%dT%H:%M:%f', 'now',
               '+' || MIN($4, $3 * (1 << MIN(pin_failed_attempts + 1 - $2, 10))) || ' seconds') || 'Z'
             ELSE NULL END
         WHERE uuid = $1 AND (pin_locked_until IS NULL OR pin_locked_until <= $5)",
    )
    .bind(profile_id)
    .bind(FREE_ATTEMPTS)
    .bind(BASE_LOCK_SECONDS)
    .bind(MAX_LOCK_SECONDS)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(reserved.rows_affected() > 0)
}

pub(super) async fn reset_attempts(pool: &SqlitePool, profile_id: &str) -> Result<(), ApiError> {
    sqlx::query(
        "UPDATE profiles SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE uuid = $1",
    )
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

/// Whether `pin` is the profile's PIN. The one place a PIN is checked.
///
/// - No profile, or none with a PIN: `Ok(false)` (nothing to verify against).
/// - Locked by earlier wrong guesses: a 429 [`ApiError`], without looking at
///   the PIN at all.
/// - Otherwise the attempt is counted first, then judged; a correct PIN
///   resets the counter and upgrades a pre-Argon2id hash to Argon2id.
pub(super) async fn check_pin(
    pool: &SqlitePool,
    profile_id: &str,
    pin: &str,
) -> Result<bool, ApiError> {
    let row: Option<(Option<String>, Option<String>)> =
        sqlx::query_as("SELECT pin_hash, pin_salt FROM profiles WHERE uuid = $1")
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    let Some((Some(stored_hash), Some(salt))) = row else {
        return Ok(false);
    };

    if !reserve_attempt(pool, profile_id).await? {
        let remaining = remaining_lock(pool, profile_id)
            .await?
            .unwrap_or(Duration::from_secs(1));
        return Err(locked_error(remaining));
    }

    let pin_owned = pin.to_string();
    let hash_to_check = stored_hash.clone();
    let verified = tokio::task::spawn_blocking(move || matches(&pin_owned, &hash_to_check, &salt))
        .await
        .map_err(|error| ApiError::internal(format!("PIN check failed: {error}")))?;
    if !verified {
        return Ok(false);
    }

    reset_attempts(pool, profile_id).await?;
    if is_legacy(&stored_hash) {
        upgrade_hash(pool, profile_id, pin, &stored_hash).await;
    }
    Ok(true)
}

/// Re-hashes a correct PIN stored the old way. Best effort: the PIN was
/// already accepted, so a failure here only leaves it for the next entry —
/// and the guard on the stored hash keeps this from overwriting a PIN that was
/// changed in between.
async fn upgrade_hash(pool: &SqlitePool, profile_id: &str, pin: &str, old_hash: &str) {
    let result = async {
        let (hash, salt) = hash_new_pin(pin)?;
        sqlx::query(
            "UPDATE profiles SET pin_hash = $1, pin_salt = $2 WHERE uuid = $3 AND pin_hash = $4",
        )
        .bind(hash)
        .bind(salt)
        .bind(profile_id)
        .bind(old_hash)
        .execute(pool)
        .await
        .map_err(ApiError::from)
    }
    .await;
    if let Err(error) = result {
        crate::diagnostics::warn(&format!("Could not upgrade a PIN hash: {}", error.message));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::repository::{
        authorize_pin_protected_access, clear_pin_impl, create_impl, set_pin_impl,
    };

    async fn pool_with_pin(pin: &str) -> (SqlitePool, String) {
        let pool = crate::test_support::migrated_pool_with_connections(2).await;
        let profile = create_impl(&pool, "Alex", None, None).await.unwrap();
        set_pin_impl(&pool, &profile.id, pin).await.unwrap();
        (pool, profile.id)
    }

    async fn attempts(pool: &SqlitePool, id: &str) -> (i64, Option<String>) {
        sqlx::query_as("SELECT pin_failed_attempts, pin_locked_until FROM profiles WHERE uuid = $1")
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn expire_lock(pool: &SqlitePool, id: &str) {
        sqlx::query(
            "UPDATE profiles SET pin_locked_until = '2000-01-01T00:00:00.000Z' WHERE uuid = $1",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn a_new_pin_is_stored_as_an_argon2id_hash_never_the_pin() {
        let (pool, id) = pool_with_pin("4242").await;
        let (hash, salt): (String, String) =
            sqlx::query_as("SELECT pin_hash, pin_salt FROM profiles WHERE uuid = $1")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(hash.starts_with("$argon2id$"), "{hash}");
        assert!(!hash.contains("4242"));
        assert!(!salt.is_empty());
        assert!(check_pin(&pool, &id, "4242").await.unwrap());
        assert!(!check_pin(&pool, &id, "4243").await.unwrap());
    }

    #[tokio::test]
    async fn two_profiles_with_the_same_pin_get_different_hashes() {
        let (first, _) = hash_new_pin("4242").map(|hash| (hash, ())).unwrap();
        let (second, _) = hash_new_pin("4242").map(|hash| (hash, ())).unwrap();
        assert_ne!(first.0, second.0);
    }

    #[tokio::test]
    async fn a_pin_stored_with_the_old_sha256_scheme_still_verifies_and_is_upgraded() {
        let (pool, id) = pool_with_pin("1111").await;
        let legacy = legacy_hash("4242", "legacy-salt");
        sqlx::query("UPDATE profiles SET pin_hash = $1, pin_salt = 'legacy-salt' WHERE uuid = $2")
            .bind(&legacy)
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        // A wrong PIN neither verifies nor upgrades anything.
        assert!(!check_pin(&pool, &id, "0000").await.unwrap());
        let (still_legacy,): (String,) =
            sqlx::query_as("SELECT pin_hash FROM profiles WHERE uuid = $1")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(still_legacy, legacy);

        assert!(check_pin(&pool, &id, "4242").await.unwrap());
        let (upgraded,): (String,) =
            sqlx::query_as("SELECT pin_hash FROM profiles WHERE uuid = $1")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(upgraded.starts_with("$argon2id$"));

        // And it keeps working under the new scheme.
        assert!(check_pin(&pool, &id, "4242").await.unwrap());
        assert!(!check_pin(&pool, &id, "0000").await.unwrap());
    }

    #[test]
    fn constant_time_eq_compares_whole_values() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[tokio::test]
    async fn wrong_guesses_lock_the_profile_even_against_the_right_pin() {
        let (pool, id) = pool_with_pin("4242").await;
        for _ in 0..FREE_ATTEMPTS {
            assert!(!check_pin(&pool, &id, "0000").await.unwrap());
        }

        let (count, locked_until) = attempts(&pool, &id).await;
        assert_eq!(count, FREE_ATTEMPTS);
        assert!(locked_until.is_some());

        let error = check_pin(&pool, &id, "4242").await.unwrap_err();
        assert_eq!(error.status, Some(429));
        // A refused attempt is not counted, and does not extend the lock.
        assert_eq!(attempts(&pool, &id).await, (count, locked_until));
    }

    #[tokio::test]
    async fn a_correct_pin_before_the_limit_resets_the_counter() {
        let (pool, id) = pool_with_pin("4242").await;
        for _ in 0..FREE_ATTEMPTS - 1 {
            assert!(!check_pin(&pool, &id, "0000").await.unwrap());
        }
        assert!(check_pin(&pool, &id, "4242").await.unwrap());
        assert_eq!(attempts(&pool, &id).await, (0, None));

        // A full allowance again.
        for _ in 0..FREE_ATTEMPTS - 1 {
            assert!(!check_pin(&pool, &id, "0000").await.unwrap());
        }
        assert!(check_pin(&pool, &id, "4242").await.unwrap());
    }

    #[tokio::test]
    async fn the_delay_grows_with_every_wrong_guess_once_the_lock_expired() {
        let (pool, id) = pool_with_pin("4242").await;
        for _ in 0..FREE_ATTEMPTS {
            check_pin(&pool, &id, "0000").await.unwrap();
        }
        let first = remaining_lock(&pool, &id).await.unwrap().unwrap();
        assert!(first <= Duration::from_secs(BASE_LOCK_SECONDS as u64));
        assert!(first > Duration::from_secs(BASE_LOCK_SECONDS as u64 - 5));

        expire_lock(&pool, &id).await;
        assert!(!check_pin(&pool, &id, "0000").await.unwrap());
        let second = remaining_lock(&pool, &id).await.unwrap().unwrap();
        assert!(second > Duration::from_secs(BASE_LOCK_SECONDS as u64 + 5));
        assert!(second <= Duration::from_secs(2 * BASE_LOCK_SECONDS as u64));

        // Many more wrong guesses never exceed the cap.
        for _ in 0..12 {
            expire_lock(&pool, &id).await;
            check_pin(&pool, &id, "0000").await.unwrap();
        }
        let capped = remaining_lock(&pool, &id).await.unwrap().unwrap();
        assert!(capped <= Duration::from_secs(MAX_LOCK_SECONDS as u64));
        assert!(capped > Duration::from_secs(MAX_LOCK_SECONDS as u64 - 5));
    }

    #[tokio::test]
    async fn the_right_pin_works_again_once_the_lock_expired() {
        let (pool, id) = pool_with_pin("4242").await;
        for _ in 0..FREE_ATTEMPTS {
            check_pin(&pool, &id, "0000").await.unwrap();
        }
        expire_lock(&pool, &id).await;
        assert!(check_pin(&pool, &id, "4242").await.unwrap());
        assert_eq!(attempts(&pool, &id).await, (0, None));
    }

    #[tokio::test]
    async fn every_pin_checking_path_shares_the_same_lock() {
        let (pool, id) = pool_with_pin("4242").await;
        // Wrong PINs through the authorization used by switch/update/remove/link.
        for _ in 0..FREE_ATTEMPTS {
            let error = authorize_pin_protected_access(&pool, &id, Some("0000"))
                .await
                .unwrap_err();
            assert_eq!(error.status, Some(403));
        }
        let error = authorize_pin_protected_access(&pool, &id, Some("4242"))
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(429));
        let error = crate::profiles::repository::verify_pin_impl(&pool, &id, "4242")
            .await
            .unwrap_err();
        assert_eq!(error.status, Some(429));
    }

    #[tokio::test]
    async fn a_missing_pin_is_not_a_guess() {
        let (pool, id) = pool_with_pin("4242").await;
        for _ in 0..(FREE_ATTEMPTS * 2) {
            assert!(
                authorize_pin_protected_access(&pool, &id, None)
                    .await
                    .is_err()
            );
        }
        assert_eq!(attempts(&pool, &id).await, (0, None));
    }

    #[tokio::test]
    async fn changing_or_clearing_the_pin_clears_the_lock() {
        let (pool, id) = pool_with_pin("4242").await;
        for _ in 0..FREE_ATTEMPTS {
            check_pin(&pool, &id, "0000").await.unwrap();
        }
        set_pin_impl(&pool, &id, "9999").await.unwrap();
        assert_eq!(attempts(&pool, &id).await, (0, None));

        for _ in 0..FREE_ATTEMPTS {
            check_pin(&pool, &id, "0000").await.unwrap();
        }
        clear_pin_impl(&pool, &id).await.unwrap();
        assert_eq!(attempts(&pool, &id).await, (0, None));
    }

    #[tokio::test]
    async fn the_attempt_counter_never_reaches_the_frontend_profile() {
        let (pool, id) = pool_with_pin("4242").await;
        check_pin(&pool, &id, "0000").await.unwrap();
        let profile = crate::profiles::get_by_id_impl(&pool, &id)
            .await
            .unwrap()
            .unwrap();
        let json = serde_json::to_string(&profile).unwrap();
        assert!(!json.to_lowercase().contains("attempt"));
        assert!(!json.contains("locked"));
    }
}
