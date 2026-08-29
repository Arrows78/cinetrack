use sqlx::SqlitePool;

use super::models::{
    AlertRow, AvailabilityAlert, AvailabilitySnapshot, MediaSummaryInput, SnapshotRow,
};
use crate::database::{new_uuid, now_iso};
use crate::error::ApiError;
use crate::models::MediaType;

pub(super) async fn list_alerts_impl(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<Vec<AvailabilityAlert>, ApiError> {
    let rows: Vec<AlertRow> = sqlx::query_as(
        "SELECT * FROM availability_alerts WHERE profile_id = $1 ORDER BY created_at DESC",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub(super) async fn get_alert_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media_id: i64,
    media_type: MediaType,
) -> Result<Option<AvailabilityAlert>, ApiError> {
    let row: Option<AlertRow> = sqlx::query_as(
        "SELECT * FROM availability_alerts WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media_id)
    .bind(media_type.as_db_str())
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

pub(super) async fn toggle_impl(
    pool: &SqlitePool,
    profile_id: &str,
    media: MediaSummaryInput,
    region: String,
    provider_ids: Vec<i64>,
) -> Result<Option<AvailabilityAlert>, ApiError> {
    // Read-then-write inside one transaction (rather than a separate
    // get_alert_impl(pool, ...) call before opening the transaction) so two
    // concurrent toggles for the same media can't both observe "absent" and
    // both insert — the second transaction's read blocks until the first
    // commits. The UNIQUE index added in migration 9 is the actual
    // guarantee; this transaction just avoids surfacing a conflict error to
    // the caller in the common case.
    let mut tx = pool.begin().await.map_err(ApiError::from)?;

    let existing: Option<AlertRow> = sqlx::query_as(
        "SELECT * FROM availability_alerts WHERE profile_id = $1 AND media_id = $2 AND media_type = $3",
    )
    .bind(profile_id)
    .bind(media.id)
    .bind(media.media_type.as_db_str())
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    if let Some(existing) = existing {
        sqlx::query("DELETE FROM availability_alerts WHERE uuid = $1")
            .bind(&existing.uuid)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from)?;
        tx.commit().await.map_err(ApiError::from)?;
        return Ok(None);
    }

    let created_at = now_iso(&mut *tx).await?;
    let alert = AvailabilityAlert {
        id: new_uuid(),
        profile_id: profile_id.to_string(),
        media_id: media.id,
        media_type: media.media_type,
        title: media.title,
        region,
        provider_ids,
        enabled: true,
        created_at,
    };

    sqlx::query(
        "INSERT INTO availability_alerts (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$8)",
    )
    .bind(&alert.id)
    .bind(&alert.profile_id)
    .bind(alert.media_id)
    .bind(alert.media_type.as_db_str())
    .bind(&alert.title)
    .bind(&alert.region)
    .bind(serde_json::to_string(&alert.provider_ids).unwrap())
    .bind(&alert.created_at)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::from)?;

    tx.commit().await.map_err(ApiError::from)?;
    Ok(Some(alert))
}

/// Scoped to `profile_id` so a profile that only knows another profile's
/// alert UUID can't delete it — `remove_availability_alert` used to accept
/// a bare `id` with no ownership check at all.
pub(super) async fn remove_impl(
    pool: &SqlitePool,
    profile_id: &str,
    id: &str,
) -> Result<(), ApiError> {
    let result = sqlx::query("DELETE FROM availability_alerts WHERE uuid = $1 AND profile_id = $2")
        .bind(id)
        .bind(profile_id)
        .execute(pool)
        .await
        .map_err(ApiError::from)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Alert not found."));
    }
    Ok(())
}

pub(super) async fn get_snapshot_impl(
    pool: &SqlitePool,
    media_id: i64,
    media_type: MediaType,
    region: &str,
) -> Result<Option<AvailabilitySnapshot>, ApiError> {
    let row: Option<SnapshotRow> =
        sqlx::query_as("SELECT * FROM availability_snapshots WHERE media_id = $1 AND media_type = $2 AND region = $3")
            .bind(media_id)
            .bind(media_type.as_db_str())
            .bind(region)
            .fetch_optional(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(row.map(Into::into))
}

// Not profile-scoped: `availability_snapshots` is a global TTL cache keyed
// by (media_id, media_type, region) shared across every local profile (see
// database::PROFILE_SCOPED_TABLES's own doc comment). Ordered/limited the
// same way library.rs's `list_impl` bounds `library_items` — a defensive
// cap against pathological growth, not a real pagination contract, so this
// stays at the same magnitude as `library::queries::LIST_SAFETY_LIMIT`
// rather than a number tuned for "typical" usage.
const LIST_SNAPSHOTS_SAFETY_LIMIT: i64 = 200_000;

pub(super) async fn list_snapshots_impl(
    pool: &SqlitePool,
) -> Result<Vec<AvailabilitySnapshot>, ApiError> {
    let rows: Vec<SnapshotRow> =
        sqlx::query_as("SELECT * FROM availability_snapshots ORDER BY checked_at DESC LIMIT $1")
            .bind(LIST_SNAPSHOTS_SAFETY_LIMIT)
            .fetch_all(pool)
            .await
            .map_err(ApiError::from)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub(super) async fn save_snapshot_impl(
    pool: &SqlitePool,
    snapshot: AvailabilitySnapshot,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT OR REPLACE INTO availability_snapshots (media_id,media_type,region,provider_ids,checked_at)
         VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(snapshot.media_id)
    .bind(snapshot.media_type.as_db_str())
    .bind(&snapshot.region)
    .bind(serde_json::to_string(&snapshot.provider_ids).unwrap())
    .bind(&snapshot.checked_at)
    .execute(pool)
    .await
    .map_err(ApiError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn migrated_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database::migrations::run_migrations(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO profiles (uuid, name, created_at, updated_at) VALUES ('other', 'Other', '2026-01-01', '2026-01-01')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn media(id: i64, media_type: MediaType, title: &str) -> MediaSummaryInput {
        MediaSummaryInput {
            id,
            media_type,
            title: title.to_string(),
        }
    }

    #[tokio::test]
    async fn creates_an_alert_on_first_toggle_and_removes_it_on_the_second() {
        let pool = migrated_pool().await;
        let m = media(7, MediaType::Movie, "Alerte");

        let created = toggle_impl(&pool, "default", m.clone(), "FR".to_string(), vec![8])
            .await
            .unwrap();
        assert!(created.is_some());
        assert!(created.unwrap().enabled);
        assert!(
            get_alert_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_some()
        );

        let removed = toggle_impl(&pool, "default", m, "FR".to_string(), vec![8])
            .await
            .unwrap();
        assert!(removed.is_none());
        assert!(
            get_alert_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn distinguishes_alerts_by_media_type() {
        let pool = migrated_pool().await;
        toggle_impl(
            &pool,
            "default",
            media(7, MediaType::Movie, "Movie"),
            "FR".to_string(),
            vec![8],
        )
        .await
        .unwrap();

        assert!(
            get_alert_impl(&pool, "default", 7, MediaType::Series)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            get_alert_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn lists_only_the_requesting_profiles_alerts() {
        let pool = migrated_pool().await;

        toggle_impl(
            &pool,
            "default",
            media(1, MediaType::Movie, "First"),
            "FR".to_string(),
            vec![8],
        )
        .await
        .unwrap();
        toggle_impl(
            &pool,
            "default",
            media(2, MediaType::Series, "Second"),
            "FR".to_string(),
            vec![9],
        )
        .await
        .unwrap();
        toggle_impl(
            &pool,
            "other",
            media(3, MediaType::Movie, "Not mine"),
            "FR".to_string(),
            vec![10],
        )
        .await
        .unwrap();

        let alerts = list_alerts_impl(&pool, "default").await.unwrap();

        // Not asserting exact DESC order here: created_at has only millisecond
        // precision (see now_iso), so two alerts created back-to-back in a
        // test can tie — the scoping behaviour below is what this test is
        // actually exercising.
        assert_eq!(alerts.len(), 2);
        assert!(alerts.iter().all(|alert| alert.profile_id == "default"));
        assert!(alerts.iter().any(|alert| alert.media_id == 1));
        assert!(alerts.iter().any(|alert| alert.media_id == 2));
        assert!(alerts.iter().all(|alert| alert.media_id != 3));

        let other_alerts = list_alerts_impl(&pool, "other").await.unwrap();
        assert_eq!(other_alerts.len(), 1);
        assert_eq!(other_alerts[0].media_id, 3);
    }

    #[tokio::test]
    async fn round_trips_a_snapshot_and_replaces_it_on_the_same_media_region_key() {
        let pool = migrated_pool().await;
        assert!(
            get_snapshot_impl(&pool, 1, MediaType::Movie, "FR")
                .await
                .unwrap()
                .is_none()
        );

        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8, 119],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        let snapshot = get_snapshot_impl(&pool, 1, MediaType::Movie, "FR")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.provider_ids, vec![8, 119]);

        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![337],
                checked_at: "2026-02-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        let replaced = get_snapshot_impl(&pool, 1, MediaType::Movie, "FR")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(replaced.provider_ids, vec![337]);
        assert_eq!(replaced.checked_at, "2026-02-01T00:00:00.000Z");
    }

    #[tokio::test]
    async fn keeps_snapshots_for_different_regions_separate() {
        let pool = migrated_pool().await;
        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "US".to_string(),
                provider_ids: vec![9],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(
            get_snapshot_impl(&pool, 1, MediaType::Movie, "FR")
                .await
                .unwrap()
                .unwrap()
                .provider_ids,
            vec![8]
        );
        assert_eq!(
            get_snapshot_impl(&pool, 1, MediaType::Movie, "US")
                .await
                .unwrap()
                .unwrap()
                .provider_ids,
            vec![9]
        );
    }

    #[tokio::test]
    async fn a_profile_cannot_remove_another_profiles_alert() {
        let pool = migrated_pool().await;
        let alert = toggle_impl(
            &pool,
            "default",
            media(7, MediaType::Movie, "Alerte"),
            "FR".to_string(),
            vec![8],
        )
        .await
        .unwrap()
        .unwrap();

        assert!(remove_impl(&pool, "other", &alert.id).await.is_err());
        assert!(
            get_alert_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_some()
        );

        remove_impl(&pool, "default", &alert.id).await.unwrap();
        assert!(
            get_alert_impl(&pool, "default", 7, MediaType::Movie)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn the_unique_index_rejects_a_duplicate_alert_bypassing_toggle_impl() {
        let pool = migrated_pool().await;
        toggle_impl(
            &pool,
            "default",
            media(7, MediaType::Movie, "Alerte"),
            "FR".to_string(),
            vec![8],
        )
        .await
        .unwrap();

        let duplicate = sqlx::query(
            "INSERT INTO availability_alerts (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
             VALUES ('dup','default',7,'movie','Alerte','FR','[8]',1,'2026-01-01','2026-01-01')",
        )
        .execute(&pool)
        .await;

        assert!(
            duplicate.is_err(),
            "the UNIQUE index on (profile_id, media_id, media_type) should reject this insert"
        );
    }

    #[tokio::test]
    async fn list_snapshots_impl_returns_every_cached_snapshot_regardless_of_profile() {
        let pool = migrated_pool().await;
        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 1,
                media_type: MediaType::Movie,
                region: "FR".to_string(),
                provider_ids: vec![8],
                checked_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();
        save_snapshot_impl(
            &pool,
            AvailabilitySnapshot {
                media_id: 2,
                media_type: MediaType::Series,
                region: "US".to_string(),
                provider_ids: vec![119],
                checked_at: "2026-01-02T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();

        let snapshots = list_snapshots_impl(&pool).await.unwrap();
        assert_eq!(snapshots.len(), 2);
        // Newest-checked first.
        assert_eq!(snapshots[0].media_id, 2);
        assert_eq!(snapshots[1].media_id, 1);
    }
}
