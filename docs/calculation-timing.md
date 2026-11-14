# Calculation timing — retired compatibility reference

Calculations is paused/retired. Current gameplay does not construct calculation-outcome arrays or collect per-cell focus, visits, edits or answer-entry durations. New complete/partial scores contain ordinary aggregates and whole-run elapsed time only. The complete former feature is archived at `archive/calculations-paused`; no further feature development is active.

## Historical schema and meaning

Existing `calculations.timing = {version: 1, cells: [{index, answerEntryMs, focusedMs, visits, edits}]}` remains readable, validated and losslessly preserved. Cells share `(run.id, index)` identity with the immutable row-major historical outcome array. Existing outcomes retain actual displayed operand order and exact final answer strings. No old array is reconstructed, enriched or backfilled, and no storage version is downgraded.

Historical `answerEntryMs` was cumulative active focused milliseconds through the final accepted value change, including pre-digit thinking and correction visits. Unedited revisits did not move that checkpoint. A final blank is `null`; an actual same-tick edit can be zero. `focusedMs` includes all observed active focus, including later waits/revisits. `edits` counts accepted changed strings (including clears), and `visits` counts focus entries rather than environment resumes. Timing excluded hidden, unfocused and non-Practice intervals; whole-run elapsed time did not. These are definitions of saved observations, not current collection behavior.

Validation remains fail-closed: durations must be finite/nonnegative, entry time cannot exceed focus time, answered timing needs a visit/edit, positions/counts must agree, and future/malformed data blocks writes without rewriting original source bytes. Unknown metadata at timing/container/cell and outcome/run/envelope levels remains untouched. Missing timing remains missing, not a zero measurement.

Historical pending intents still replay in order through the unchanged atomic score journal/Web Lock/receipt path. Ordinary new saves preserve all old rows and nested detail. Reads/navigation alone leave exact primary bytes unchanged. Web Locks coordinate cooperating clients only: already-open older feature binaries can continue their old collection until reloaded. Reload all app tabs after upgrading.
