---
description: "Validate your Google Shopping product feed offline and catch disapprovals before upload — required-attribute, format, policy, and SEO rules. No API call, no auth. A drop-in CI gate."
---

# gmc preflight

**Offline feed-compliance scanner.** `preflight` checks your product data against Merchant Center rules **before** you upload — catching disapprovals locally, with no API call and no auth. Run it on a [`feeds pull`](/reference/feeds) directory, a single file, or (with `--remote`) the live catalog. Its exit code makes it a drop-in CI gate.

```sh
gmc preflight                       # scan ./feeds
gmc preflight --dir catalog         # scan a directory
gmc preflight --file product.json   # scan a single file
gmc preflight --remote              # pull the live catalog and scan it (needs auth)
gmc preflight --json                # full machine-readable report
```

| Option            | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `--dir <path>`    | Directory of product files to scan (default `feeds`)   |
| `--file <path>`   | Scan a single product file instead of a directory      |
| `--remote`        | Pull the live catalog and scan it (needs auth/account) |
| `--config <path>` | Path to a `.gmcpreflightrc` (overrides discovery)      |
| `--strict`        | Treat warnings as failures (non-zero exit)             |
| `--rule <id...>`  | Only run the named rule(s)                             |
| `--page-size <n>` | Max products per API page (with `--remote`)            |

Products are read as push-ready [ProductInput](/reference/products#gmc-products-insert) JSON — the exact files `feeds pull` produces — so preflight scans precisely what `push` would upload. An unparseable file isn't skipped: it's reported as an error finding, because catching bad files is the point.

## What it checks

Each rule has a stable dotted id and a default severity. Rules come in four families: **`required.*`** (a missing attribute the Merchant API rejects), **`format.*`** (an attribute that's present but malformed), **`policy.*`** (editorial disapproval triggers), and **`seo.*`** (search-optimization tips). A `format.*` rule fires only when its attribute is present — an absent value is the matching `required.*` rule's finding, so a missing title is reported once, not twice.

| Rule                           | Default | Catches                                                                      |
| ------------------------------ | ------- | ---------------------------------------------------------------------------- |
| `required.offer-id`            | error   | Missing offer id (the unique product identifier)                             |
| `required.title`               | error   | Missing or blank `title`                                                     |
| `required.description`         | error   | Missing or blank `description`                                               |
| `required.link`                | error   | Missing landing-page `link`                                                  |
| `required.image-link`          | error   | Missing `image_link`                                                         |
| `required.availability`        | error   | Missing `availability`                                                       |
| `required.price`               | error   | Missing `price` / missing amount                                             |
| `required.condition`           | warning | Missing `condition` (recommended; required for used/refurbished)             |
| `required.identifier-exists`   | warning | None of `gtin` / `mpn` / `brand` present                                     |
| `format.link-url`              | error   | `link` is not a valid http(s) URL                                            |
| `format.image-link-url`        | error   | `image_link` is not a valid http(s) URL                                      |
| `format.price-amount`          | error   | `amountMicros` is not a non-negative integer count of micros                 |
| `format.price-currency`        | error   | A priced product's `currencyCode` is missing or not a 3-letter code          |
| `format.availability-enum`     | error   | `availability` not in `in_stock` / `out_of_stock` / `preorder` / `backorder` |
| `format.condition-enum`        | error   | `condition` not in `new` / `refurbished` / `used`                            |
| `format.gtin-checksum`         | warning | `gtin` is the wrong length or fails its check digit                          |
| `format.title-length`          | warning | `title` exceeds 150 characters                                               |
| `format.description-length`    | warning | `description` exceeds 5000 characters                                        |
| `policy.promotional-title`     | error   | Promotional text in `title` (e.g. "free shipping", "20% off", "best price")  |
| `policy.title-caps`            | warning | `title` is excessively capitalized (SHOUTING)                                |
| `policy.title-symbols`         | warning | Gimmicky symbols or emoji in `title`                                         |
| `policy.phone-in-title`        | warning | A phone number in `title`                                                    |
| `policy.link-https`            | warning | Landing-page `link` uses `http`, not `https`                                 |
| `seo.title-length`             | info    | Title shorter than 30 characters (optimal range for Google Shopping)         |
| `seo.title-brand`              | info    | Brand name missing from the product title                                    |
| `seo.title-attributes`         | info    | Title missing differentiating attributes (color, size) when available        |
| `seo.description-length`       | info    | Description shorter than 500 characters (optimal range)                      |
| `seo.title-equals-description` | info    | Title and description are identical                                          |
| `seo.description-has-brand`    | info    | Description doesn't mention the brand                                        |
| `seo.image-placeholder`        | info    | Image URL matches a placeholder pattern (e.g. "no-image", "coming-soon")     |

The `policy.*` family predicts editorial **disapproval** triggers — these are heuristic, so all default to `warning` except `policy.promotional-title` (a well-known hard disapproval, an `error`). The `seo.*` family flags search-optimization opportunities — all default to `info` (non-gating even with `--strict`), so they surface as suggestions without blocking your pipeline. Override any rule's level — or turn it off — in [`.gmcpreflightrc`](#configuring-rules-gmcpreflightrc); `warning` findings don't fail the run unless you pass `--strict`.

::: tip Related
[`gmc migrate`](/reference/migrate) helps you move off the Content API for Shopping (retiring Aug 18, 2026); migrated feeds drop straight into `preflight`.
:::

## Findings

A finding names the product (by its composite id `{contentLanguage}~{feedLabel}~{offerId}`, or `local~{contentLanguage}~{feedLabel}~{offerId}` for legacy-local products), the offending attribute, what's wrong, and how to fix it. Human output groups findings by product:

```
gmc preflight — scanned 2 product(s)

en~US~SKU2
  ✗ title — Missing title — every product must have a `title`.
      → Set productAttributes.title to the product's name as shown to shoppers.
  ✗ price — Missing price — every product must have a `price` with an amount.
      → Set productAttributes.price.amountMicros (and currencyCode), e.g. 49990000 / "USD".

2 errors across 1 product(s).
Failed.
```

`--json` emits the full report — `ok`, `exitCode`, `scanned`, `strict`, `counts`, and every `finding` — on a single line:

```json
{
  "ok": false,
  "exitCode": 6,
  "scanned": 2,
  "strict": false,
  "counts": { "error": 2, "warning": 0, "info": 0 },
  "findings": [
    {
      "ruleId": "required.title",
      "severity": "error",
      "productKey": "en~US~SKU2",
      "offerId": "SKU2",
      "attribute": "title",
      "message": "…",
      "suggestion": "…",
      "documentation": "…"
    }
  ]
}
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
