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

## `gmc reports query <mcql>`

Run any MCQL query and print the result rows (one JSON object per line, then a count) — or `--json`
for `{ "results": [...] }`. This is the escape hatch for views and columns the presets don't cover.

```sh
gmc reports query "SELECT clicks, conversions, conversion_value FROM product_performance_view WHERE date BETWEEN '2026-05-01' AND '2026-05-31'" --json
```

## Exit codes

`0` success · `2` usage (malformed `--since`/`--until`, non-positive `--days`, bad `--page-size`) ·
`3` auth · `5` Merchant API.
