# Browser storage contract

All application data lives in this origin's browser `localStorage`. There is no account, backend or remote backup. Reads project supported data without rewriting it. An unreadable value is **not** an empty dataset.

## Keys and versions

| Key | Format and ownership |
| --- | --- |
| `times-tables.scores` | `{version: 4, scores: [...]}`. Stable run IDs; append/union, never snapshot replacement. History, rankings and graphs read the same records. |
| `times-tables.settings` | Flat version 1 object; accepts legacy unversioned objects. Authoritative shared Practice/Stats order and exact preset/custom factors, plus optional boolean `spaceToAdvance`. Absent Space preference projects to false without a write; only a deliberate Settings toggle writes that field. Legacy history-filter fields are preserved but no longer control Stats. Saves contain only deliberate patches. |
| `times-tables.progress` | Flat version 1 object; accepts legacy unversioned objects. Legacy graph order and factor-set fields remain preserved but are no longer authoritative. Graph presentation preferences include optional `axisMode` (`time` or `runs`; absent means Runs). Axis changes use the same deliberate-patch intent journal and locked replay; unknown axis formats are read-only. Practice and Stats always read the exact selection from gameplay settings. Shared controls are disabled while a round is running or saving; a completed-round settings change returns practice to ready without deleting its saved result. Optional `showAverage5`, `showAverage25` and `showRecord` booleans control whole-series visibility, including markers and tooltip rows; absent flags mean visible. Explicit `false` survives journal serialization and replay. Legacy/unknown fields (including older window visibility names) are preserved, not renamed or deleted. Averages of up to 5 and 25 perfect completed runs and the record staircase are derived views only; no scores schema change or score write is involved. |
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

## Final calculation details

The v4 score envelope is unchanged. Newly submitted complete/partial runs have one optional additive `calculations: {version: 1, cells: [...]}` extension, committed in the **same score intent/transaction**. Historical runs without this field remain unchanged and have unknown detail coverage; aggregate incorrect totals cannot identify their wrong calculations. No independent analytics snapshot or counter is stored. Answers stay on this device.

Every cell (including blank cells) is stored in row-major order with zero-based `index`, `rowIndex`, `columnIndex`, actual displayed operands `row` and `column`, exact final entered string `answer` (including leading zeros), `product`, and `status` (`correct`, `incorrect`, `unanswered`). `index = rowIndex * size + columnIndex`; `(run.id, index)` is the cell identity. Reversed operands remain distinct. Blank strings are unanswered, not incorrect; only final strings at submission are captured, not transient edits. Cancelled or zero-answer rounds have no submitted score details. Failed writes retain the existing unsaved warning; the detail view does not present session-only results as recorded history.

Validation requires exactly `total` uniquely positioned cells, consistent axes containing the score's exact factors, ordered axes for Ordered runs, exact products, digit strings of 0–3 characters, derived statuses, and exact agreement with aggregate attempted/correct counts. The extension is optional only for historical/source compatibility. Unknown metadata at envelope, run, detail and cell levels is preserved; unsupported detail versions or malformed/conflicting data block writes without changing original bytes. Arrays are indivisible immutable values under the existing stable-ID merge; do not later replace an existing run's cells to enrich them. Compatible future collection fields may be added to **new** runs only, with explicit validation and coverage semantics. Incompatible versions require the forward-only backed-up migration contract above; never reinterpret missing fields as measured zeros.

Stats → Calculations uses the same exact order/factor selection as Overview and Practice. Wrong counts are divided by all answered detailed observations of that ordered operand pair, including partial runs. Unanswered cells and aggregate-only history do not enter that denominator. Coverage reports detailed runs / selected submitted runs and answered detailed cells. Rows sort by wrong count descending, then row operand, then column operand; on-demand answer detail retains exact incorrect strings and counts alongside the correct product.

## Per-cell answer-entry timing

New submissions also carry optional `calculations.timing: {version: 1, cells: [{index, answerEntryMs, focusedMs, visits, edits}]}` in the same immutable score payload, never a separate key or writer. Timing cells match the outcome array positions; existing outcome arrays are never rebuilt/enriched. Stage-1 detail and aggregate-only history keep missing timing. Unknown metadata at timing/container/cell levels survives untouched. Future or malformed timing fails closed with the existing storage warning and no primary rewrite.

Durations are finite nonnegative monotonic-clock milliseconds. `answerEntryMs` is cumulative active focused time through the final accepted changed string, including pre-digit thinking and correction visits; a final blank is `null`, not zero. A same-tick accepted edit can be a genuine zero. `focusedMs` retains total observed active focus, including later unedited revisits and post-answer waits; it cannot be smaller than entry time. `visits` counts focus entries (not pause resumes), `edits` counts accepted changed strings including clears. Unvisited cells have zero focus/edits; answered timing requires a visit/edit. All positions and counts are validated. Cancel/reset discards the unsubmitted collector.

The collector is created at the guarded start transition and frozen synchronously at guarded finish. It pauses when the document is hidden, the window unfocused or Practice inactive, without changing whole-round elapsed timing. The final-cell wait to Finish does not move the answer-entry checkpoint. See [exact lifecycle semantics](calculation-timing.md).

Calculations defaults to Errors; Times shares the exact same committed source and authoritative settings. Ordered pairs rank by median correct-final-answer entry time; incorrect samples are separately marked, and no-correct medians are missing. Raw distributions and exact keyboard-accessible sample tables retain zeros, duplicates and outliers. Coverage gives timed runs / selected submissions and measured versus missing answered details; aggregate-only cell coverage is unknown. There are no inferred per-cell times or targeted practice mode.

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
