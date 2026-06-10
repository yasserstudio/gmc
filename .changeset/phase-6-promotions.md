---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

fix(api): target Merchant API **v1**; feat: `gmc promotions` (Phase 6, v0.9.10)

**Critical alignment fix:** the Merchant API `v1beta` was shut down on Feb 28, 2026. Every sub-API now targets the stable **v1** endpoint — `products/v1`, `accounts/v1`, `datasources/v1`, `inventories/v1`, `promotions/v1` — and the `doctor` probe hits `accounts/v1`. Paths are otherwise unchanged; this is purely the version segment moving `v1beta` → `v1` so live calls reach a supported endpoint.

**`gmc promotions`** (closes Phase 6) — manage Merchant Center promotions via the promotions sub-API:

- `@gmc-cli/api` gains `PromotionsService` (`getPromotion` / `listPromotions` / `insertPromotion`); the API exposes insert/get/list (no delete — promotions expire). `insert` sends the `InsertPromotionRequest` body `{ promotion, dataSource }` (verified against the v1 reference — unlike `productInputs.insert`, dataSource is a body field, not a query param).
- `gmc promotions list|get|insert` — `insert` reads the `Promotion` JSON from `--file`/stdin and requires `--data-source`.

With `gmc inventory` (v0.9.9), Phase 6 (inventories + promotions) is complete. Next: Phase 7 — reports.
