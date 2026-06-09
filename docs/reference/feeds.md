# gmc feeds

**Feeds as code** — sync your catalog to version-controllable local files. `pull` exports the account's products to a directory and `push` applies a directory back to a data source; `diff` arrives in v0.9.2. Operates on the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

## `gmc feeds pull`

Export the catalog to a directory, **one JSON file per product**, each a push-ready [ProductInput](/reference/products#gmc-products-insert) (output-only fields like status are stripped, so the files round-trip cleanly).

```sh
gmc feeds pull                      # → ./feeds/<id>.json per product
gmc feeds pull --dir catalog        # custom directory
gmc feeds pull --json               # { "pulled": N, "dir": "feeds" }
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Output directory (default `feeds`) |
| `--page-size <n>` | Max products per API page |

Each file is named by the product's composite id and contains a push-ready input:

```
feeds/
  online~en~US~SKU1.json
  online~en~US~SKU2.json
```

```json
// online~en~US~SKU1.json
{
  "offerId": "SKU1",
  "contentLanguage": "en",
  "feedLabel": "US",
  "channel": "ONLINE",
  "attributes": { "title": "Trail Runner", "price": { "amountMicros": "49990000", "currencyCode": "USD" } }
}
```

Commit the directory to version control, review changes as ordinary diffs, then `push` it back.

Products with no derivable id, a filename collision, or a write error are **skipped** and counted (the run continues); `--json` includes a `skipped` count when non-zero.

## `gmc feeds push`

Apply a directory of product files back to a data source — the inverse of `pull`. Every `*.json` file is inserted as a [ProductInput](/reference/products#gmc-products-insert) (create-or-replace) under the target `--data-source`.

```sh
gmc feeds push --data-source 1234567        # apply ./feeds to the data source
gmc feeds push --dir catalog --data-source 1234567
gmc feeds push --data-source 1234567 --json # { "pushed": N, "dataSource": "1234567", "dir": "feeds" }
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Input directory (default `feeds`) |
| `--data-source <id>` | Target data source id or resource name (**required**) |

`--data-source` is always explicit: pulled files don't record their origin source. Create one with [`gmc datasources create`](/reference/datasources).

Files are applied in name order. A **malformed or non-object `.json` file** is skipped and recorded (the rest of the directory still applies); with `--json` the output gains `failed` and `failures` entries, and the run exits `1`. Non-`.json` files are ignored. Inserts are **idempotent**, so an interrupted push can be safely re-run.

## Exit codes

`1` partial (some local files invalid) · `2` usage (no account, no `--data-source`, unreadable directory) · `3` auth · `4` config · `5` Merchant API (a rejected insert aborts the run).

::: tip Coming next
`gmc feeds diff` (v0.9.2) shows what would change before pushing.
:::
