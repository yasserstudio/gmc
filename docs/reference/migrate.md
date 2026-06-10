# gmc migrate

**Content API for Shopping → Merchant API assistant.** Google retires the Content API for Shopping on **August 18, 2026**; `migrate` helps you move to the Merchant API. Phase 5 builds it in three steps, all below: `migrate scopes` (v0.9.6), `migrate products` (v0.9.7), and `migrate feed-labels` (v0.9.8).

```sh
gmc migrate scopes                                   # audit auth readiness
gmc -p mystore migrate scopes --from merchant-info.json          # dry-run a config migration
gmc -p mystore migrate scopes --from merchant-info.json --write --set-default   # apply it
gmc migrate scopes --json                            # machine-readable report
```

## `gmc migrate scopes`

Audits your Content API → Merchant API **auth** readiness, then optionally migrates a legacy Content API config into a `gmc` profile.

| Option | Description |
|--------|-------------|
| `--from <path>` | Legacy Content API `merchant-info.json` to import |
| `--set-default` | Make the migrated profile the default |
| `--write` | Write the migrated profile to `config.json` (otherwise dry-run) |

The target profile name is the active profile (`-p, --profile`, default `default`); the merchant id comes from `--from` or `-a, --account`.

### The scope, in one line

The Merchant API uses the **same OAuth scope** as the Content API — `https://www.googleapis.com/auth/content`. Your existing tokens keep working; **no re-consent is required**. Google models per-sub-API scopes for the future, but they all resolve to that one scope today, so `gmc` is ready for granular scopes without any change on your side.

The real migration blockers aren't the scope — they're **enabling the Merchant API** on your Google Cloud project and **registering that project** as an API client. `migrate scopes` checks both (the same live probe behind [`gmc doctor`](/reference/doctor)), so a green run means you're genuinely ready, not just scope-compatible.

```
gmc migrate scopes — Content API → Merchant API

OAuth scope: unchanged. The Merchant API uses the same scope as the Content API:
  https://www.googleapis.com/auth/content
Existing tokens keep working — no re-consent is required today.

✓ Credential resolved — Authenticated as sa@proj.iam.gserviceaccount.com (project proj-1).
✓ Merchant API access — Merchant API reachable — 1 account(s) accessible.
```

The audit is **best-effort and non-fatal**: run it mid-migration before auth is wired up and an unresolved credential or unreachable API degrades to a `⚠`/`✗` line, never an aborted command. Use [`gmc doctor`](/reference/doctor) for the full diagnosis.

### Migrating a legacy config

If you bootstrapped from Google's [shopping samples](https://github.com/googleads/googleads-shopping-samples), you have a `merchant-info.json` holding your `merchantId`. Point `migrate scopes` at it to seed a `gmc` profile:

```sh
gmc -p mystore migrate scopes --from merchant-info.json --set-default --write
```

```
Config migration
  Created profile "mystore" → account 123456789.
  Set "mystore" as the default profile.
  Wrote ~/.config/gmc/config.json. Verify with `gmc doctor`.
```

Without `--write` it's a **dry-run** — it prints exactly what *would* change (`Would create…`) and touches nothing. With `--write` it creates or updates the profile, preserving every other profile and the existing default unless `--set-default` is given. Re-running once the profile already matches is a safe no-op. No `merchant-info.json`? Pass `-a <id>` instead of `--from`.

### `--json`

```json
{
  "audit": {
    "legacyScope": "https://www.googleapis.com/auth/content",
    "scopeUnchanged": true,
    "mapping": [ { "subApi": "products", "scopes": ["https://www.googleapis.com/auth/content"] } ],
    "checks": [ { "id": "credential", "title": "Credential resolved", "status": "pass", "detail": "…" } ],
    "ok": true
  },
  "plan": { "profileName": "mystore", "accountId": "123456789", "action": "create", "conflict": false, "setsDefault": true },
  "written": true
}
```

## `gmc migrate products`

Converts **Content API v2.1 product JSON** into push-ready Merchant API [`ProductInput`](/reference/products) files — the same shape [`feeds pull`](/reference/feeds) emits — so the output drops straight into `gmc feeds push` and `gmc preflight`. This completes the **migrate → validate → upload** pipeline.

```sh
gmc migrate products --from content                 # a dir of Content API product files → ./feeds
gmc migrate products --file products.json --out feeds   # a single product, array, or products.list dump
gmc migrate products --from content --feed-label US-en  # override the feed label for every product
gmc preflight --dir feeds                           # validate the converted catalog before push
```

| Option | Description |
|--------|-------------|
| `--from <dir>` | Directory of Content API product JSON files (default `content`) |
| `--file <path>` | A single product, a JSON array, or a `products.list` response (`{resources:[…]}` / `{products:[…]}`); takes precedence over `--from` |
| `--out <dir>` | Output directory for `ProductInput` files (default `feeds`) |
| `--feed-label <label>` | Override the derived feed label for every product |

### What it converts

The Merchant API keeps only *identity* fields at the top level and nests everything descriptive under `attributes`, and both APIs share the product-spec attribute names — so the transform moves every field except the identity ones into `attributes`, converts prices to micros, and remaps the identity fields:

| Content API v2.1 | Merchant API | |
|---|---|---|
| `price: {value:"49.99", currency:"USD"}` | `attributes.price: {amountMicros:"49990000", currencyCode:"USD"}` | value × 1,000,000 (BigInt, half-up at 6 dp); also `salePrice`, nested `shipping[].price`, … |
| `availability: "in stock"` | `attributes.availability: "in_stock"` | enum spaces → underscores |
| `targetCountry: "US"` | `feedLabel: "US"` | the key remap (an explicit `feedLabel` wins; `--feed-label` overrides) |
| `id: "online:en:US:SKU1"` | `offerId`/`contentLanguage`/`feedLabel` | parsed to backfill missing identity, then dropped |
| `title`, `description`, `link`, `customLabel0`, `shipping`, … | `attributes.*` | moved as-is (names match) |
| `customAttributes: [{name,value}]` | `customAttributes` | carried through |
| `id` / `kind` / `source` / `selfLink` | — | output-only → dropped |

Each run prints a **migration report** — products converted, identity remaps, dropped fields, and any warnings (e.g. a price whose value isn't a number, left for `preflight` to flag) — or the full report as `--json`.

## `gmc migrate feed-labels`

Verifies that your migrated feed labels resolve to feeds your campaigns target. Google Ads Shopping campaigns serve products by their feed identity `(feedLabel, contentLanguage)` — the same tuple a primary data source is keyed by. After migration, a product whose feed identity matches **no** data source lands in a feed no campaign targets and **silently stops serving**. This check catches that before you push.

```sh
gmc migrate feed-labels --dir feeds          # analyze the migrated feed (offline)
gmc -a 123 migrate feed-labels --dir feeds   # + cross-check against the account's data sources
gmc -a 123 migrate feed-labels --remote      # check the live catalog
gmc migrate feed-labels --dir feeds --strict # warnings fail the run too
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Directory of product files to check (default `feeds`) |
| `--remote` | Pull and check the live catalog instead (needs auth) |
| `--strict` | Treat warnings as failures (non-zero exit) |
| `--page-size <n>` | Max products per API page (with `--remote`) |

The **cross-check** runs whenever an account is resolved (`-a` / profile / env): it lists the account's data sources and matches each product group against them. With `--dir` and no account it degrades to offline analysis (a note says so); `--remote` requires auth, so it always cross-checks.

| Rule | Severity | Catches |
|------|----------|---------|
| `feed-label.missing` | error | A product with no `feedLabel` — it can't be grouped or served |
| `feed-label.unmatched` | error (cross-check) | A group that matches no primary data source → products land in a feed no campaign targets |
| `feed-label.case-variant` | warning | The same label in different cases (`US` vs `us`) — Merchant Center treats them as two feeds |
| `feed-label.orphaned-source` | info (cross-check) | A data source with no products to fill it |

The report prints the feed-label **distribution** — each group, its product count, and whether it matches a data source — so you can confirm migrated labels line up with your campaigns.

```
gmc migrate feed-labels — scanned 120 product(s) across 2 feed-label group(s)

feed labels:
  CA / en  18 product(s)  ✗ no matching data source
  US / en  102 product(s) ✓ matches a data source

✗ No primary data source has feedLabel "CA" (contentLanguage en) — 18 product(s) would land in a feed no campaign targets.
    → Create a matching data source (gmc datasources create) or correct the feed label.

1 error across 2 group(s).
Failed.
```

## Exit codes

- **`migrate scopes`** is an *assistant, not a CI gate* — audit findings are advisory, so a reachability warning or a failing probe still exits `0`. Only real errors fail: `2` usage (a non-numeric `--account`, an unreadable `--from`, or a legacy file with no valid `merchantId`) · `4` config (writing an invalid profile).
- **`migrate products`** writes every product it can convert, but exits `1` if **any** product couldn't be converted (not an object, no derivable `offerId`, unparseable file) — so CI gates an incomplete migration. Dropped-field and price warnings are informational (exit `0`). `2` usage for an unreadable `--from`/`--file`.
- **`migrate feed-labels`** is a CI gate like `preflight`: exits `1` on error findings (missing or unmatched feed labels) or an unparseable file; warnings (case variants) gate only with `--strict`. `2`/`3` usage/auth for `--remote`.

`scopes` + `products` + `feed-labels` cover the full Content API → Merchant API move: auth, product data, and the feed-label safety net.
