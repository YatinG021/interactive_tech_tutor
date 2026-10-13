# Phase 5: Backend deployment

## What runs where
- `apps/api/Dockerfile`: Node 22 multi-stage build; runs as the `node` user; `DATA_DIR=/data`, port 8000.
- Image `ghcr.io/yating021/interactive-tech-tutor-api` (public, inherits the repository's visibility, so Azure pulls it without credentials).
- Container App `itt-api`: WorkloadProfiles environment `itt-env`, Consumption profile, 0–1 replicas, single revision, readiness and liveness probes on `/health`.
- Azure Files share `itt-data` mounted at `/data` with `uid=1000,gid=1000,nobrl,mfsymlinks,cache=strict`.
- Secrets `jwt-secret`, `aoai-key` (and later `sarvam-key`) referenced with `secretRef`.
- `.github/workflows/deploy-backend.yml`: build → push → `az containerapp update` → poll `/health` until it reports the new commit. A service principal scoped to `itt-rg` is stored as `AZURE_CREDENTIALS`.

## Problems and how they were solved

**Express environments cannot mount Azure Files.** The CLI's default environment mode is *Express*, which rejects storage. The environment was recreated in *WorkloadProfiles* mode.

**Reused deployment names served stale configuration.** After changing a deployment's model or capacity under the same name, the gateway kept serving the old model and rate limit for over 30 minutes. That made gpt-4.1-mini look capped at 30K tokens/min and gpt-5-mini look inconsistent. Fresh, model-specific names fixed it: `gpt41mini-v1` (150K tokens/min) and `itt-llm-burst` (gpt-5-mini, 100K). Rule: a new name for every model or capacity change, verified by the response's `model` field and the `x-ratelimit-limit-tokens` header.

**Overflow deployment.** The LLM client tries the primary without retry delays; on 429, 5xx or timeouts it uses the overflow deployment (with a larger token budget for hidden reasoning), then falls back to the primary with full retries.

## Verified in production
A user created three deployments earlier could still sign in with progress intact (the share works); a cold simulation took 27 s and a repeat 0.6 s; CORS allowed the Pages origin and rejected others.
