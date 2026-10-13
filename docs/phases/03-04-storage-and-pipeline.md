# Phases 3–4: Storage and generation pipeline

## Storage: DynamoDB + S3 + `store.json` → SQLite
- `apps/api/src/db/db.ts`: one SQLite file (`DATA_DIR/app.db`) with `users`, `sessions`, `preferences`, `progress`, `history` and `simulation_cache` (later `tts_cache`).
- Passwords: salted **scrypt** (`scrypt$salt$hash`). Sessions are stored by a SHA-256 of the token.
- Progress updates run in a transaction, which removes the old read-modify-write race in `store.json`.
- Backup scripts now export and import SQLite as JSON.
- All `@aws-sdk/*` packages removed. The server starts with no cloud credentials at all.

Caveats handled for SQLite on Azure Files: one replica, single revision, `nobrl` mount, rollback journal instead of WAL.

## Pipeline: three serial passes → parallel
| Before | After |
|---|---|
| Full generation, then full regeneration of every step's elements, then step-by-step repairs | 1 outline call → every step's canvas **in parallel** → at most 3 weak steps repaired **in parallel** |
| S3 cache written but never read | Persistent SQLite cache shared by all users, plus in-flight de-duplication |

| Measurement | Result |
|---|---|
| Cold simulation | about 20 s |
| Repeat topic | 0.01 s, survives restarts |
| Two users, same topic | one shared generation |
| Four simulations at once | 18–45 s, no errors |

## Prompts rewritten for the GPT-4.1 / GPT-5 family
- Static rules in the system message first, so Azure's automatic prompt caching applies (≈2,200 of 2,400 input tokens cached).
- The element schema the renderer understands is spelled out (the old prompt literally said `"elements": [ ... ]`).
- Structured Outputs for the outline and for voice actions; layout recipes; a running example shared across steps.

## Bugs found and fixed
- A confusion-matrix-only repair ran on **every** topic and snapped any row of boxes into a 2×2 grid, stacking the fifth box on the first.
- The quality gate's threshold was unreachable (typical good steps score ~65, the bar was 68), so every step was "repaired".
- Unlabeled decorative shapes were counted as placeholder labels and given captions like "circle 7".
