# Documentation

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | System design, data model, request flows, the simulation pipeline and the renderer |
| [api-reference.md](api-reference.md) | Every endpoint with request and response shapes |
| [backend-setup.md](backend-setup.md) | API configuration, environment variables and the production checklist |
| [operations.md](operations.md) | Deployments, secrets, key rotation, costs, Azure inventory and AWS teardown |
| [ui-ux-prompt.md](ui-ux-prompt.md) | The product and design spec the frontend was built from |
| [product/](product/) | The original requirements and design documents |

## Project history, phase by phase

| Phase | Document | Outcome |
|---|---|---|
| 0 | [Assessment and plan](phases/00-assessment-and-plan.md) | Requirements, the AWS inventory and the Azure target |
| 1 | [Azure foundation](phases/01-azure-foundation.md) | Subscription, region policy, Azure OpenAI, repository move |
| 2 | [Language model](phases/02-language-model.md) | Bedrock replaced by Azure OpenAI |
| 3–4 | [Storage and generation pipeline](phases/03-04-storage-and-pipeline.md) | DynamoDB and S3 replaced by SQLite; parallel generation; new prompts |
| 5 | [Backend deployment](phases/05-backend-deployment.md) | Container Apps, Azure Files, CI/CD with smoke test |
| 6 | [Frontend](phases/06-frontend.md) | Next.js app on GitHub Pages, curated simulations, aligned diagrams, Sarvam voice |
| 7 | [Cleanup](phases/07-cleanup.md) | Old app and AWS-era config removed, repository restructured |
