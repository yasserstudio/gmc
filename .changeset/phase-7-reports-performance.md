---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(reports): `gmc reports` — MCQL query + product performance (Phase 7, v0.9.11)

Opens Phase 7 (reports) with the Merchant API reports sub-API (`reports/v1`).

- **`@gmc-cli/api`** gains `ReportsService.search(query, { pageSize })` — runs a Merchant Center Query Language (MCQL) query via `POST reports/v1/.../reports:search`, paginating with the `pageToken` in the request body (not a query param) and collecting `results`.
- **`gmc reports performance`** — product clicks/impressions/CTR/conversions from `product_performance_view` over a window (`--days` default 30, or `--since`/`--until`), rendered as a date-sorted table or `--json`.
- **`gmc reports query <mcql>`** — run any MCQL query; prints rows (NDJSON) or `--json`. The escape hatch for views the presets don't cover.

Next in Phase 7: competitive visibility + price insights (v0.9.12), then CI threshold alerting (v0.9.13).
