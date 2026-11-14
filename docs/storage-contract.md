# Browser storage contract

All application data lives in this origin's browser `localStorage`. There is no account, backend or remote backup. Reads project supported data without rewriting it. An unreadable value is **not** an empty dataset.

## Keys and versions

| Key | Format and ownership |
| --- | --- |
| `times-tables.scores` | `{version: 4, scores: [...]}`. Stable run IDs; append/union, never snapshot replacement. History, rankings and graphs read the same records. |
| `times-tables.settings` | Flat version 1 object; accepts legacy unversioned objects. Gameplay, retained custom factors, history filters and optional boolean `spaceToAdvance`. Absent Space preference projects to false without a write; only a deliberate Settings toggle writes that field. Saves contain only deliberate patches. |
| `times-tables.progress` | Flat version 1 object; accepts legacy unversioned objects. Independent graph order and exact factor-set selection, plus optional `axisMode` (`time` or `runs`; absent means Time). Axis changes use the same deliberate-patch intent journal and locked replay as other graph preferences; unknown axis formats are read-only. Optional `showAverage5`, `showAverage25` and `showRecord` booleans control whole-series visibility, including markers and tooltip rows; absent flags mean visible. Explicit `false` survives journal serialization and replay. Legacy/unknown fields (including older window visibility names) are preserved, not renamed or deleted. Averages of up to 5 and 25 perfect completed runs and the record staircase are derived views only; no scores schema change or score write is involved. |
| `times-tables.theme` | Literal `dark` or `light`. Unknown formats are read-only. |
| `times-tables.run-tracking` | Version 1 metadata with `incomplete` history marker. Existing metadata is not rewritten by ordinary starts. |
| `times-tables.run-start.<id>` | Version 1 immutable start event: mode and exact factors. A completed/partial score reuses this ID; cancellation does not delete the start. |
| `<target>.backup.v<source-version>` | JSON array of exact source strings, deduplicated by content. Preferences use `vunversioned`. Created only for actual schema migration, before primary replacement. Never automatically pruned. |
| `<target>.intent.<sequence>-<uuid>` | Version 1 immutable write-ahead operation, with a `payload`. Target is one of scores, settings, progress, theme or run-tracking. Synchronously written and read back before awaiting a lock. |
| `<target>.receipt.<sequence>-<uuid>` | Exact version 1 acknowledgement written only after the complete corresponding operation is verified. Neither receipts nor intent source bytes are removed. |

There is no application `clear`/`removeItem` path, session storage or IndexedDB. Reset/cancel affects only the in-memory round. Unfinished answers and timers are not saved; a durable run start is not a resumable round.

## Forward migration

Scores use additive steps: v1 adds size 12; v2 adds complete status and attempted count; v3 adds preset factors; v4 supports arbitrary exact sets. Reserved fields already present must agree with the addition. Legacy preference objects gain version 1 while retaining unknown fields. Theme and run tracking currently need no schema migration.

A migration must preserve every original ID, timestamp, count, elapsed value, factor array and unknown field at every nesting level. Preserve partial and incorrect records as well as perfect results. Do not filter unrecognized array members, normalize persisted identifiers, truncate history, or use a UI projection as replacement data. Supported old versions move only forward. Unsupported versions/shapes, duplicate record IDs, conflicting identities, duplicate JSON members and numbers that JSON would silently round/coerce block writes and retain original bytes.

Before replacing a legacy primary value, append its **exact original string**, including whitespace, to its versioned backup and verify the backup. Backup corruption, denied access, quota failure or interruption must not destroy the primary source. Reads alone do not migrate. Repeated migrations/recovery must be idempotent. Unknown fields may be extended compatibly; conflicting stable-ID values are refused, not last-writer-wins replacements.

## Durability and concurrency

All cooperating writers acquire an origin-scoped exclusive Web Lock named after the target. Re-read and validate under that lock. Scores merge by stable ID; preferences merge deliberate field patches against the latest object. There is no unlocked read/merge/write fallback.

The event handler first validates the operation without mutating primary storage, then synchronously persists an immutable intent. This closes the asynchronous lock-acquisition/reload gap. On startup, pending operations are replayed in sequence/UUID order under their target locks **before** application state is restored. Truly simultaneous cross-tab patches have a deterministic UUID tie-break; independent fields are retained. Loading shows recovery status while a pending lock is held. Completed-result UI waits for save settlement. Failures warn honestly; the page remains playable when storage is unavailable.

Primary writes and acknowledgements are read back. A crash after primary commit but before receipt safely replays the same operation. Recovery processes earlier unacknowledged operations before later ones, preventing a retry from reverting an acknowledged later preference. Intents, receipts and backups are retained without automatic compaction; quota exhaustion is surfaced, never handled by deleting history. A corrupt/future pending operation or receipt blocks that target's recovery without overwriting its source.

## Requirements for future changes

1. Inventory every persisted key, reader, writer and schema step here. New collection fields must obey this same contract, including journal payloads and receipts.
2. Add explicit supported versions and deterministic additive migrations. Preserve raw recoverable source bytes before any schema rewrite; never reset or downgrade unsupported data.
3. Keep validation, merge, journal replay and ordinary save on one implementation path. Re-read under the origin lock; never introduce an uncoordinated writer or destructive fallback.
4. Add synthetic fixtures for every historical format, richer unknown metadata, custom sets, malformed arrays, future versions, duplicate/conflicting IDs, numeric coercion, denied reads, quota/backup/receipt failures and interruption at every write boundary.
5. Test real immediate reload/close after the UI event while another tab holds the target lock—not merely a test that waits for storage before reloading. Verify exact source/backup/intent bytes, all IDs and complete record counts after recovery. Test concurrent stale tabs and independent preference patches.
6. Reconcile concurrent feature changes; run unit tests, typecheck, build and the full affected browser union. Verify the exact deployed commit and every emitted asset, then exercise production migration/concurrency/reload in fresh synthetic browser contexts.

## Limits

Web Locks coordinate upgraded cooperating tabs only. Already-open older binaries can still run their old writers: reload all app tabs after upgrading. This is not retroactive protection against old clients, devtools or other origin scripts. Future releases must assess rollback/old-client compatibility explicitly.

Local backups and journals cannot prevent browser eviction, clear-site-data, private-session expiry, device loss or storage hardware failure. A failed synchronous intent write is not durable and is reported as unsaved. Closing a tab before its event handler executes cannot save an operation that never occurred. There is no claim of filesystem-level power-loss durability or remote recovery. Back up/export browser data separately when those risks matter.
