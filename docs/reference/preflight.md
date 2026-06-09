# gmc preflight

**Offline feed-compliance scanner.** `preflight` checks your product data against Merchant Center rules **before** you upload — catching disapprovals locally, with no API call and no auth. Run it on a [`feeds pull`](/reference/feeds) directory, a single file, or (with `--remote`) the live catalog. Its exit code makes it a drop-in CI gate.

```sh
gmc preflight                       # scan ./feeds
gmc preflight --dir catalog         # scan a directory
gmc preflight --file product.json   # scan a single file
gmc preflight --remote              # pull the live catalog and scan it (needs auth)
gmc preflight --json                # full machine-readable report
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Directory of product files to scan (default `feeds`) |
| `--file <path>` | Scan a single product file instead of a directory |
| `--remote` | Pull the live catalog and scan it (needs auth/account) |
| `--config <path>` | Path to a `.gmcpreflightrc` (overrides discovery) |
| `--strict` | Treat warnings as failures (non-zero exit) |
| `--rule <id...>` | Only run the named rule(s) |
| `--page-size <n>` | Max products per API page (with `--remote`) |

Products are read as push-ready [ProductInput](/reference/products#gmc-products-insert) JSON — the exact files `feeds pull` produces — so preflight scans precisely what `push` would upload. An unparseable file isn't skipped: it's reported as an error finding, because catching bad files is the point.

## What it checks

Each rule has a stable dotted id and a default severity. v0.9.3 ships the engine with a seed set; the full library lands across Phase 4.

| Rule | Default | Catches |
|------|---------|---------|
| `required.offer-id` | error | Missing offer id (the unique product identifier) |
| `required.title` | error | Missing or blank `title` |
| `required.price` | error | Missing `price` / missing amount |

::: tip Coming next
v0.9.4 adds the full required-attribute + format library (link/image URLs, price & currency, enums, GTIN checksums, length limits, identifier-exists); v0.9.5 adds policy / disapproval-trigger heuristics.
:::

## Findings

A finding names the product (by its composite id `{channel}~{contentLanguage}~{feedLabel}~{offerId}`), the offending attribute, what's wrong, and how to fix it. Human output groups findings by product:

```
gmc preflight — scanned 2 product(s)

ONLINE~en~US~SKU2
  ✗ title — Missing title — every product must have a `title`.
      → Set attributes.title to the product's name as shown to shoppers.
  ✗ price — Missing price — every product must have a `price` with an amount.
      → Set attributes.price.amountMicros (and currencyCode), e.g. 49990000 / "USD".

2 errors across 1 product(s).
Failed.
```

`--json` emits the full report — `ok`, `exitCode`, `scanned`, `strict`, `counts`, and every `finding` — on a single line:

```json
{ "ok": false, "exitCode": 6, "scanned": 2, "strict": false,
  "counts": { "error": 2, "warning": 0, "info": 0 },
  "findings": [ { "ruleId": "required.title", "severity": "error", "productKey": "ONLINE~en~US~SKU2", "offerId": "SKU2", "attribute": "title", "message": "…", "suggestion": "…", "documentation": "…" } ] }
```

## Configuring rules — `.gmcpreflightrc`

Drop a project-local `.gmcpreflightrc` next to your feeds (commit it — it's part of the feed-as-code workflow). preflight discovers it by walking up from the scanned directory, the same way ESLint/Prettier find their config; `--config <path>` overrides discovery.

```json
{
  "rules": {
    "required.title": "warning",
    "required.price": "off"
  },
  "ignore": ["legacy-sku-1", "legacy-sku-2"],
  "targetCountry": "US",
  "strict": false
}
```

- **`rules`** — override a rule's severity (`error` / `warning` / `info`) or disable it with `off`.
- **`ignore`** — offer ids to skip entirely (e.g. known-legacy products); they aren't scanned or counted.
- **`targetCountry`** — ISO-3166 alpha-2 code for locale-aware rules (used from v0.9.4).
- **`strict`** — treat warnings as failures for the exit code. `--strict` on the command line forces this on.

## CI gate

`preflight` exits non-zero when it finds gating issues, so it fails a build before a bad feed ships:

```sh
gmc feeds pull --dir feeds        # export the catalog
gmc preflight --dir feeds         # exits 6 on any error-severity finding
```

## Exit codes

`0` clean (or only warnings, without `--strict`) · `2` usage (unknown `--rule`, unreadable `--file`/directory) · `3` auth (`--remote`) · `4` config (malformed `.gmcpreflightrc`) · `5` Merchant API (`--remote`) · `6` **preflight found gating violations**.
