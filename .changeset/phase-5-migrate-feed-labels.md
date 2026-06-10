---
"@gmc-cli/cli": patch
"@gmc-cli/migrate": patch
---

feat(migrate): `gmc migrate feed-labels` — feed-label transfer check (Phase 5, v0.9.8)

Closes Phase 5. Google Ads Shopping campaigns serve products by their feed identity `(channel, feedLabel, contentLanguage)` — the same tuple a primary data source is keyed by. After a Content API → Merchant API migration, a product whose feed identity matches no data source lands in a feed no campaign targets and silently stops serving. `gmc migrate feed-labels` catches that before push.

- **Offline analysis** — groups the feed by feed identity, flags products with no `feedLabel`, and warns on case variants (`US` vs `us`, which Merchant Center treats as different feeds).
- **Live cross-check** — when an account is resolved, lists the account's primary data sources and flags any group that matches none (the campaign-killer); also reports orphaned data sources. `--remote` checks the live catalog directly.
- **CI gate** like `preflight` — exits non-zero on error findings; warnings gate only with `--strict`. Prints a feed-label distribution table (per group: product count + whether it matches a data source) or `--json`.

The check lands in `@gmc-cli/migrate` (`checkFeedLabels`, pure). Together with `migrate scopes` (v0.9.6) and `migrate products` (v0.9.7), Phase 5 covers the full migration: auth, product data, and the feed-label safety net.
