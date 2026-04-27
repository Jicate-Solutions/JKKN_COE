# Vercel Deploy via GitHub Actions Hook (Skip Auto-Deploy)

Use this when Vercel auto-deploy is blocked for a specific user but the deploy hook works fine.

## Problem

- Push to `main` via GitHub Desktop → Vercel auto-deploys → **Blocked**
- Other team members push fine, but one user's pushes get blocked
- Deploying via Vercel deploy hook works without any block

## Solution

Disable Vercel's auto-deploy from `main` and use GitHub Actions to trigger deployment via a deploy hook instead.

---

## Step 1: Disable Auto-Deploy in vercel.json

Add this to your project's `vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

If you already have other config (e.g. `crons`), merge it:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  },
  "crons": [
    {
      "path": "/api/cron/your-cron",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

## Step 2: Get Your Vercel Deploy Hook URL

1. Go to Vercel Dashboard → Project → **Settings → Git**
2. Scroll to **Deploy Hooks**
3. Create a hook (e.g. name: `github-actions`, branch: `main`)
4. Copy the hook URL — looks like:
   `https://api.vercel.com/v1/integrations/deploy/prj_xxx/yyyyyyy`

---

## Step 3: Create GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Trigger Vercel Deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel Deploy Hook
        run: |
          curl -X POST -f -sS \
            "YOUR_VERCEL_DEPLOY_HOOK_URL_HERE"
```

Replace `YOUR_VERCEL_DEPLOY_HOOK_URL_HERE` with the URL from Step 2.

> **Tip:** Store the hook URL as a GitHub Secret (`VERCEL_DEPLOY_HOOK`) for security:
> ```yaml
> run: curl -X POST -f -sS "${{ secrets.VERCEL_DEPLOY_HOOK }}"
> ```
> Add it under: GitHub Repo → Settings → Secrets and variables → Actions → New secret

---

## Step 4: Commit and Push

```bash
git add vercel.json .github/workflows/deploy.yml
git commit -m "fix: disable vercel auto-deploy, use github actions hook"
git push
```

After this push lands, all future pushes to `main` will:
- Skip Vercel auto-deploy (no more Blocked status)
- Trigger GitHub Actions → which calls the deploy hook → Vercel deploys cleanly

---

## How It Works

```
Push to main (GitHub Desktop / CLI)
        |
        ├── Vercel Git integration → SKIPPED (deploymentEnabled: false)
        |
        └── GitHub Actions triggers
                |
                └── curl POST to Vercel Deploy Hook
                        |
                        └── Vercel deploys ✅ (no Blocked status)
```

---

## Fallback Options (if vercel.json config not supported on your plan)

### Option A: Skip per commit
Add `[vercel skip]` to any commit message you don't want to deploy:
```
fix: update styles [vercel skip]
```

### Option B: Disconnect Git Integration
Vercel → Project Settings → Git → **Disconnect Repository**
Then deploy only via hooks. You lose preview deployments for PRs.

---

## Checklist for New Projects

- [ ] Add `"git": { "deploymentEnabled": { "main": false } }` to `vercel.json`
- [ ] Create Vercel deploy hook in project settings
- [ ] Add `.github/workflows/deploy.yml` with hook URL
- [ ] Store hook URL as GitHub Secret (`VERCEL_DEPLOY_HOOK`)
- [ ] Push and verify GitHub Actions runs successfully
- [ ] Confirm no more "Blocked" status in Vercel dashboard
