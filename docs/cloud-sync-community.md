# Cloud sync and community

This patch adds the infrastructure needed for the same signed-in CineTrack
account to converge across multiple Tauri installations without replacing the
local-first SQLite architecture.

## Data flow

```text
local business transaction
        |
        +--> SQLite row
        +--> SQLite trigger -> sync_outbox   (same transaction)
                                  |
                                  v
                         apply_sync_batch RPC
                                  |
                         sync_documents + sync_changes
                                  |
                    pull_sync_changes(after cursor)
                                  |
                                  v
                    Rust remote apply -> SQLite
```

Realtime is only a wake-up signal. A device that was asleep or offline always
recovers through the durable `sync_changes.sequence` cursor.

## Conflict policy

`sync_documents.version` is an optimistic concurrency token. Every local
outbox row carries the last remote version it observed. A server mismatch is
returned as a conflict rather than silently overwriting data.

The first implementation uses **pending-local-wins after rebase**: the local
mutation is kept, its base version is moved to the latest server version, and
the next push retries. This is deterministic and avoids clock-based last-write
wins. `viewing_event` conflicts are naturally rare because event UUIDs are
append-oriented.

## Existing installs

Migration 018 creates triggers only for future writes. `prepare_sync` performs
a one-time, profile-scoped bootstrap by executing no-op updates that fire those
triggers, plus explicit seeding for append-only viewing events and saved
filters. The bootstrap marker is stored in `sync_metadata`.

This is why an existing desktop library is uploaded instead of being replaced
by an empty new-device state.

## Profile IDs

Supabase authentication (`auth.uid()`) is the global account identity. Local
`profiles.uuid` remains a local SQLite partition key. Synced payloads keep the
entity UUIDs but the Rust apply layer deliberately replaces their profile
scope with the receiving installation's active local profile.

Never authorize cloud rows from a `supabase_user_id` string passed through
Tauri IPC. Cloud authorization is entirely RLS + `auth.uid()`.

## What synchronizes

- library items
- seen movies
- episode progress
- tracked series
- viewing events
- custom lists and items
- smart lists
- saved filters
- availability alerts

Not synchronized intentionally:

- `activity_log` (internal/noisy; community activities are explicit)
- availability snapshots / TMDB cache
- diagnostics
- backup directory
- `activeProfileId`
- OS notification permission/state

Account preferences should be moved into the `account_preferences` sync
document once their current mixed account/device model is split. Do not sync
absolute backup paths or device layout state.

## Community boundary

Community tables are **not views over sync_documents**. Publication is an
explicit product action:

```text
PRIVATE                                 COMMUNITY
library/progress/history       --X-->   no implicit access
local/custom list              ---->    published list snapshot
rating/notes                   ---->    explicit review only
completion                     ---->    explicit activity only
```

Defaults remain private. Followers cannot query private library/progress rows.

## Supabase setup

1. Link the repository to a Supabase project.
2. Apply both migrations in chronological order.
3. Enable Email/OAuth providers and the existing CineTrack callback URLs.
4. Keep only the publishable key in `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Never ship the service-role key in Tauri or Vite environment variables.
6. Confirm `sync_changes` is in the `supabase_realtime` publication.

## Recommended verification before merge

Run the existing project checks plus these manual two-device scenarios:

1. Device A has a pre-existing library, Device B is empty. Sign into A, sync,
   then B. B must receive A's library.
2. Disconnect B, modify an item on A and the same item on B, reconnect B.
   B's pending value is rebased and pushed; A receives the converged value on
   its next pull.
3. Delete an item offline, reconnect, and verify the tombstone reaches the
   other device.
4. Kill the app after the RPC returns but before ACK. The retry must be
   deduplicated by `sync_mutations.mutation_id`.
5. Modify the same row while an upload is in flight. ACK must not delete the
   replacement outbox mutation.
6. Switch accounts/profiles and verify each profile has an independent cursor
   and outbox scope.
7. Sleep a device through several Realtime notifications. On resume, cursor
   pull must recover every missed change.

## Community verification

- private account produces pending follows; target can accept
- blocking removes follows and hides content both ways
- muting removes the account from the chronological feed without blocking it
- spoiler reviews preserve the spoiler flag; UI must hide body by default
- user-entered profile/review/comment text must be rendered as text, never
  with `dangerouslySetInnerHTML`
- review likes/comments create in-app notifications through server triggers
- report rows are writable by reporter but are not publicly readable

## Mobile

The sync engine itself is platform-neutral Tauri/Rust/SQLite and is suitable
for the existing mobile-gated build. Remaining mobile release work is outside
the sync protocol: generated iOS/Android projects, OAuth callback registration,
CI signing, store credentials, lifecycle testing and push-notification tokens.

Do not live-sync `app.db` through Dropbox/iCloud/OneDrive. SQLite/WAL files are
not a multi-writer cloud protocol; the outbox/change-log layer is.
