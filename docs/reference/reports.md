# gmc reports

**Query Merchant Center reports.** Reporting is a single method — `reports.search` — that runs a
[Merchant Center Query Language](https://developers.google.com/merchant/api/guides/reports/query-language)
(MCQL) query against a report view and returns rows. `gmc reports` gives you both the raw query tool
and a canned **performance** report.

```sh
gmc reports performance                       # last 30 days of product performance
gmc reports performance --since 2026-05-01 --until 2026-05-31
gmc reports performance --json                # raw rows
gmc reports query "SELECT clicks, impressions FROM product_performance_view WHERE date BETWEEN '2026-05-01' AND '2026-05-31'"
```

## `gmc reports performance`

Product performance (clicks, impressions, CTR, conversions) over a date window, from the
`product_performance_view`.

| Option | Description |
|--------|-------------|
| `--days <n>` | Window size in days, ending today (default `30`) |
| `--since <date>` | Start date (ISO `YYYY-MM-DD`); overrides `--days` |
| `--until <date>` | End date (ISO; default today) |
| `--page-size <n>` | Max rows per API page |

Human output is a date-sorted table; `--json` emits `{ "results": [...], "since", "until" }` with the
raw `ReportRow`s.

## `gmc reports competitive-visibility`

How your domain's visibility compares to competitors in a category, from
`competitive_visibility_competitor_view`. Country and category are **required** (the view mandates
them); the window defaults to the last 30 days.

```sh
gmc reports competitive-visibility --country US --category 536
gmc reports competitive-visibility --country US --category 536 --traffic-source ORGANIC --since 2026-05-01 --until 2026-05-31
```

| Option | Description |
|--------|-------------|
| `--country <code>` | 2-letter report country code, e.g. `US` (required) |
| `--category <id>` | Numeric Google product category id, e.g. `536` (required) |
| `--traffic-source <src>` | `ADS`, `ORGANIC`, or `ALL` (default `ADS`) |
| `--days` / `--since` / `--until` | Date window (default last 30 days) |

Output is a table of competitor domains with rank, relative visibility, page overlap, and
higher-position rate (your own domain is marked); `--json` for the raw rows.

## `gmc reports price-competitiveness`

Your prices vs the category benchmark per product, from `price_competitiveness_product_view`
(`price` and `benchmark_price` are amounts).

```sh
gmc reports price-competitiveness
gmc reports price-competitiveness --country US
```

| Option | Description |
|--------|-------------|
| `--country <code>` | Filter to a 2-letter report country code |
| `--page-size <n>` | Max rows per API page |

## `gmc reports query <mcql>`

Run any MCQL query and print the result rows (one JSON object per line, then a count) — or `--json`
for `{ "results": [...] }`. This is the escape hatch for views and columns the presets don't cover.

```sh
gmc reports query "SELECT clicks, conversions, conversion_value FROM product_performance_view WHERE date BETWEEN '2026-05-01' AND '2026-05-31'" --json
```

## Exit codes

`0` success · `2` usage (malformed `--since`/`--until`, non-positive `--days`, bad `--page-size`) ·
`3` auth · `5` Merchant API.
