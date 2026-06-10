---
"@gmc-cli/cli": patch
---

feat: gmc-action — a GitHub Action with a preflight gate (Phase 8, v0.9.15)

Adds a composite GitHub Action (`action.yml`) so `gmc` runs in CI: `uses: yasserstudio/gmc@v1` runs any gmc command (default `preflight`) and propagates its exit code, so a feed-compliance gate fails the build before a bad feed ships. `preflight` runs offline (no auth); authenticated commands take a service-account key via the `credentials` secret (written to a temp file, `0600`, wired to ADC).

Inputs flow through environment variables rather than `${{ }}` interpolation in the run step, so a crafted `args` can't inject shell. Documented in the guide (with a sample workflow). The Action invokes the published `@gmc-cli/cli`, so it goes fully live with the npm publish at v1.0.
