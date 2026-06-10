---
"@gmc-cli/cli": patch
---

feat(reports): `gmc reports check` — CI threshold gate (Phase 7, v0.9.13)

Closes Phase 7. `gmc reports check --metric <clicks|impressions|conversions|ctr> [--min <n>] [--max <n>] [--days/--since/--until]` aggregates `product_performance_view` over a window and **exits non-zero when the metric breaches the threshold** — so a Shopping performance regression fails CI (mirrors the GPC vitals gate). `--json` emits a `{ metric, value, min, max, ok, since, until }` verdict.

CLI-only (reuses `ReportsService` + the verified performance query; aggregation is client-side — sums for counts, `clicks/impressions` for CTR). With v0.9.11–12, Phase 7 (reports) is complete. Next: Phase 8 — CI/CD (JSON/exit-code hardening, `gmc-action`, GitLab recipe).
