---
"@gmc-cli/preflight": patch
"@gmc-cli/migrate": patch
"@gmc-cli/core": patch
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

Pre-v1 audit hardening (quality + Google-API alignment + packaging + security):

- **API alignment — `channel` removed (Merchant API v1).** v1 dropped the `channel`
  field from products, product inputs, and data sources, replacing it with a boolean
  `legacyLocal`. Product identity is now the 3-segment `{contentLanguage}~{feedLabel}~{offerId}`
  (a `local~` prefix marks legacy-local products) — `productKey`, `productFileName`, and
  the feed-label grouping drop the old `channel` segment, so `feeds diff` no longer
  mis-pairs and `datasources create` no longer sends a removed field. **Breaking flag
  change:** `gmc datasources create --channel <online|local>` → `--legacy-local`
  (boolean). `migrate products` now maps a Content API `channel: "local"` to
  `legacyLocal: true` (online is the v1 default and carries no field).
- **Packaging — self-contained npm package.** The `@gmc-cli/cli` build now bundles the
  `@gmc-cli/*` workspace packages (so a global / `npx` install resolves no internal
  packages at runtime) and ships no source maps. Only `commander` and
  `google-auth-library` remain runtime dependencies.
- **Robustness.** `--days` and `--page-size` reject non-plain-integer and out-of-range
  values (no more date underflow or `1e21` reaching the query string); `gmc config path`
  now emits the standard `{ ok: false, error }` envelope on failure; `feeds push` reports
  its partial `pushed` count in the JSON failure envelope.
- **Security.** The release-binaries workflow passes the release tag via an environment
  variable instead of interpolating it into the shell (command-injection hardening).
