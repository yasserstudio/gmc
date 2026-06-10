---
"@gmc-cli/cli": patch
---

docs: GitLab CI recipe + env-var auth (Phase 8, v0.9.16)

Closes Phase 8. Adds a GitLab CI guide: an offline `preflight` gate job (no credentials) and an authenticated job that uses the existing **`GMC_SERVICE_ACCOUNT`** env-var auth — a GitLab **File-type CI/CD variable** holding the service-account key, which `gmc` reads by path (keeping the key off the command line and out of logs). No code change — env-var auth (file path *or* raw JSON via `GMC_SERVICE_ACCOUNT`) already ships; this documents the CI recipe for it.

With the GitHub Action (v0.9.15), Phase 8 (CI/CD) is complete. Next: Phase 9 — docs polish, Homebrew + standalone binary, brand/marketing — then the full pre-launch audit + smoke test → v1.0.0.
