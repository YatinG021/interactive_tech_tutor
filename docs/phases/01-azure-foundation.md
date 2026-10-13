# Phase 1: Azure foundation

## What was set up
- Azure CLI 2.91 with the `containerapp` extension; signed in to the **Azure for Students** subscription.
- Resource providers registered: `Microsoft.App`, `Microsoft.OperationalInsights`, `Microsoft.CognitiveServices`, `Microsoft.Storage`.
- Resource group `itt-rg` and the AI Services (Foundry) resource `itt-foundry-yg`.
- The repository moved to `github.com/YatinG021/interactive_tech_tutor` (history preserved; the original `LICENSE` merged in, no force-push). The old origin is kept as the `arnav` remote.

## Problems and how they were solved

**The Foundry "Create project" dialog failed.** The subscription carries an *Allowed resource deployment regions* policy that permits only Austria East, Korea Central, East Asia, Indonesia Central and Malaysia West; the dialog defaulted to West US 3. Querying model availability per allowed region showed only **Korea Central** offers gpt-4.1-mini on Global Standard *and* Container Apps, so every resource lives there. The resource was created from the CLI instead of the dialog.

**Keys stay out of chat.** The model key was written straight into the gitignored `apps/api/.env` and never printed.
