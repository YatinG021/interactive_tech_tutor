# Operations

## Deployments

| What changed | Workflow | What it does |
|---|---|---|
| `apps/api/**`, root `package*.json` | `deploy-backend.yml` | Builds the image, pushes it to `ghcr.io/yating021/interactive-tech-tutor-api`, rolls out a new revision, waits until `/health` reports the new commit |
| `apps/frontend/**` | `deploy-frontend.yml` | Static build with `NEXT_PUBLIC_API_URL` (repo variable `API_BASE_URL`) and the `/<repo>` base path, publishes to GitHub Pages |

Both can also be run by hand from the Actions tab (`workflow_dispatch`).

## Azure inventory (subscription "Azure for Students", region Korea Central)

| Resource | Name | Notes |
|---|---|---|
| Resource group | `itt-rg` | Everything lives here |
| AI Services | `itt-foundry-yg` | Endpoint `https://itt-foundry-yg.openai.azure.com` |
| Deployment | `gpt41mini-v1` | gpt-4.1-mini, 150K tokens/min, primary |
| Deployment | `itt-llm-burst` | gpt-5-mini, 100K tokens/min, overflow only |
| Container Apps environment | `itt-env` | WorkloadProfiles mode (Express mode cannot mount Azure Files) |
| Container App | `itt-api` | 0.5 vCPU / 1 GiB, 0-1 replicas, single revision |
| Storage account | `ittdatayg1013` | File share `itt-data` mounted at `/data` |
| Service principal | `itt-github-deployer` | Contributor on `itt-rg` only; GitHub secret `AZURE_CREDENTIALS` |

The subscription only allows these regions: Austria East, Korea Central, East Asia, Indonesia Central, Malaysia West.

## Secrets

Real values never go in the repository or in chat.

| Secret | Where it lives |
|---|---|
| `JWT_SECRET` | Container App secret `jwt-secret`; local `apps/api/.env` |
| `AZURE_OPENAI_API_KEY` | Container App secret `aoai-key`; local `apps/api/.env` |
| `SARVAM_API_KEY` | Container App secret `sarvam-key`; local `apps/api/.env` |
| `AZURE_CREDENTIALS` | GitHub repository secret |

All `.env` files are gitignored; each app commits a `.env.example` with names only.

### Rotate the Sarvam key
1. In the Sarvam dashboard, create a new API key and delete the old one (the dashboard shows a key only once).
2. Put it in `apps/api/.env` as `SARVAM_API_KEY=...`.
3. Run `./scripts/rotate-sarvam-key.sh`. It checks the key with Sarvam first, then updates the Container App secret and restarts the revision.

### Rotate the Azure OpenAI key
```bash
az cognitiveservices account keys regenerate -n itt-foundry-yg -g itt-rg --key-name key1
KEY=$(az cognitiveservices account keys list -n itt-foundry-yg -g itt-rg --query key1 -o tsv)
az containerapp secret set -n itt-api -g itt-rg --secrets aoai-key="$KEY"
```
Then update `apps/api/.env` and restart the revision.

## Changing the model

Create a **new** deployment name for every model or capacity change and switch `AZURE_OPENAI_DEPLOYMENT` once it serves correctly. Reusing a name kept serving the old model and rate limit for over 30 minutes. Check with:
```bash
curl -s -D - "$ENDPOINT/openai/deployments/<name>/chat/completions?api-version=2024-10-21" \
  -H "api-key: $KEY" -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"max_completion_tokens":20}' | grep -i ratelimit-limit-tokens
```
The response's `model` field and the `x-ratelimit-limit-tokens` header must match what you deployed.

## Costs

| Item | Cost driver |
|---|---|
| Container App | Consumption, scales to zero when idle |
| Azure Files (5 GB) | Cents per month |
| Azure OpenAI | Per token; repeat topics are served from cache |
| Sarvam TTS | About ₹30 per 10K characters; each sentence is paid for once, capped by `TTS_DAILY_CHAR_LIMIT` |
| GitHub Pages, Actions, GHCR | Free for this public repository |

## Logs and health
```bash
curl https://itt-api.orangefield-ee93915e.koreacentral.azurecontainerapps.io/health
az containerapp logs show -n itt-api -g itt-rg --follow
```
`[LLM]` lines show per-call latency, tokens and cache use; `[TTS]` lines show every paid synthesis.

## AWS teardown (old stack)

Nothing uses AWS any more. The original resources belong to the previous project owner's AWS account; no AWS credentials exist on the current machine or in this repository, so the owner has to remove them:

| Resource | Command (run as the account owner) |
|---|---|
| Amplify app (`master.d3kfpuqsbfsujm.amplifyapp.com`) | `aws amplify delete-app --app-id d3kfpuqsbfsujm` |
| DynamoDB tables | `aws dynamodb delete-table --table-name itt-users` (and `itt-sessions`, `itt-simulation-history`) |
| S3 bucket | `aws s3 rb s3://interactive-tech-tutor-cache --force` |
| IAM user / access keys used by the app | `aws iam delete-access-key --user-name <user> --access-key-id <id>` |
| Bedrock | Nothing to delete (pay per use) |
| Render service `interactive-tech-tutor-api` | Delete in the Render dashboard |

## Teardown (Azure)
```bash
az group delete -n itt-rg --yes     # irreversible: deletes the API, the database share and the models
```
