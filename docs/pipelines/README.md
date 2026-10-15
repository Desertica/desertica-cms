# Pipelines

GitHub only accepts workflow files pushed by a token with the `workflow` scope, so these live here until someone installs them:

```bash
mkdir -p .github/workflows && cp docs/pipelines/*.yml .github/workflows/
git add .github/workflows && git commit -m "Install pipelines" && git push
```

`docker.yml` replaces the previous one: images come from `develop` (staging) and `v*` tags (production), never from `main` directly.

## Flow
`feat/*` -> PR to `develop` (CI + security) -> merge deploys staging -> PR `develop` -> `main` -> tag `vX.Y.Z` -> production, gated by the `production` environment.

## One-time setup (repo settings)
1. Environments `staging` and `production`; on `production` add required reviewers and restrict to tags `v*`.
2. Secrets per environment: `COOLIFY_TOKEN`, `COOLIFY_STAGING_WEBHOOK` / `COOLIFY_PRODUCTION_WEBHOOK` (Coolify: application -> Webhooks -> Deploy webhook).
3. Rulesets on `main` and `develop`: require PR, 1 approval, code owner review, required checks `commit-policy`, `build`, `codeql`, `dependency-review`, `secrets`, `audit`, `image`; block force-push and deletion; linear history.
4. Enable Dependabot alerts, secret scanning and push protection (Settings -> Code security).
5. In Coolify, point the app at the GHCR image (`:develop` for staging, the version tag for production) instead of building from Git.
