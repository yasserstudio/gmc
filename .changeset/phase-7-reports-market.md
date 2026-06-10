---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(reports): competitive visibility + price competitiveness (Phase 7, v0.9.12)

Two more `gmc reports` presets on the reports sub-API:

- **`gmc reports competitive-visibility --country <c> --category <id>`** — how your domain's visibility compares to competitors (`competitive_visibility_competitor_view`): rank, relative visibility, page-overlap and higher-position rates. Country + category are required (the view mandates them); `--traffic-source` (ADS/ORGANIC/ALL, default ADS) and a date window (`--days`/`--since`/`--until`).
- **`gmc reports price-competitiveness [--country <c>]`** — your prices vs the category benchmark per product (`price_competitiveness_product_view`; `price`/`benchmark_price` are amounts).

`@gmc-cli/api`'s `ReportRow` gains typed `competitiveVisibilityCompetitorView` and `priceCompetitivenessProductView` views. All column names and required filters verified against the Merchant API reports guides. Next: v0.9.13 — CI threshold alerting.
