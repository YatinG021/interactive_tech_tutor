# Phase 7: Cleanup

## Done
- Removed the old Vite app (`apps/web`), `render.yaml` and `vercel.json`.
- The root npm workspace now contains only `apps/api`; the lockfile was regenerated from scratch (0 vulnerabilities).
- Removed the Amplify and Vercel CORS origins; the built-in development origin is `http://localhost:3000`.
- The Dockerfile and `.dockerignore` no longer reference the old app.
- The Pages workflow builds `apps/frontend`; GitHub Actions updated to versions that run on Node 24.
- Deleted the empty resource group `rg-yatin_gogia23-1720` left by the failed Foundry dialog.
- The Sarvam key is a Container App secret.

## Repository restructure
- API source grouped by role: `src/db/` (schema, seed), `src/services/` (LLM, prompts, TTS), `src/scripts/` (backups).
- Documentation moved under `docs/` (phases, architecture, operations, API reference, product specs, assets).
- Environment handling: every `.env` / `.env.*` is gitignored; each app commits a `.env.example`.
- `scripts/rotate-sarvam-key.sh` rotates the voice key without pasting it anywhere.
- Removed a stale `apps/api/package-lock.json` (the root lockfile governs the workspace).

## Outstanding (needs an account owner)
- **AWS teardown.** The old resources are in the previous owner's AWS account and no AWS credentials exist here. The exact list and commands are in [operations.md](../operations.md#aws-teardown-old-stack).
- **Sarvam key rotation.** Keys can only be created in the Sarvam dashboard; then run `scripts/rotate-sarvam-key.sh`.
