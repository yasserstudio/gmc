# gmc feeds

**Feeds as code** — sync your catalog to version-controllable local files. `pull` exports the account's products to a directory, `push` applies a directory back to a data source, and `diff` previews what `push` would change. Operates on the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

## `gmc feeds pull`

Export the catalog to a directory, **one JSON file per product**, each a push-ready [ProductInput](/reference/products#gmc-products-insert) (output-only fields like status are stripped, so the files round-trip cleanly).

```sh
gmc feeds pull                      # → ./feeds/<id>.json per product
gmc feeds pull --dir catalog        # custom directory
gmc feeds pull --json               # { "pulled": N, "dir": "feeds" }
```

| Option            | Description                        |
| ----------------- | ---------------------------------- |
| `--dir <path>`    | Output directory (default `feeds`) |
| `--page-size <n>` | Max products per API page          |

Each file is named by the product's composite id and contains a push-ready input:

```
feeds/
  en~US~SKU1.json
  en~US~SKU2.json
```

```json
// en~US~SKU1.json
{
  "offerId": "SKU1",
  "contentLanguage": "en",
  "feedLabel": "US",
  "attributes": {
    "title": "Trail Runner",
    "price": { "amountMicros": "49990000", "currencyCode": "USD" }
  }
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

| Option               | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `--dir <path>`       | Input directory (default `feeds`)                     |
| `--data-source <id>` | Target data source id or resource name (**required**) |

`--data-source` is always explicit: pulled files don't record their origin source. Create one with [`gmc datasources create`](/reference/datasources).

Files are applied in name order. A **malformed or non-object `.json` file** is skipped and recorded (the rest of the directory still applies); with `--json` the output gains `failed` and `failures` entries, and the run exits `1`. Non-`.json` files are ignored. Inserts are **idempotent**, so an interrupted push can be safely re-run.

## `gmc feeds diff`

Preview what `push` would change — compares the local directory against the **live catalog** and classifies each product. Read-only; touches nothing.

```sh
gmc feeds diff                          # compare ./feeds with the whole catalog
gmc feeds diff --dir catalog
gmc feeds diff --data-source 1234567    # scope to one source (exact push preview)
gmc feeds diff --json                   # { "added": [...], "updated": [...], "unchanged": N, "orphaned": [...], "dir": "feeds" }
```

| Option               | Description                                         |
| -------------------- | --------------------------------------------------- |
| `--dir <path>`       | Input directory (default `feeds`)                   |
| `--data-source <id>` | Only compare against products from this data source |
| `--page-size <n>`    | Max products per API page                           |

Each product is matched by its composite id (`{contentLanguage}~{feedLabel}~{offerId}`, or `local~{contentLanguage}~{feedLabel}~{offerId}` for legacy-local products), independent of filename, and bucketed:

- `+` **added** — in the directory, not yet in the catalog (`push` would create it)
- `~` **updated** — present in both, but the content differs (`push` would replace it)
- **unchanged** — identical (counted, not listed, to keep output compact)
- `-` **orphaned** — in the catalog, not in the directory. Reported for awareness; **`push` never removes products**, so these are unaffected.

By default `diff` compares against the **whole catalog** (all data sources). Since `push` targets one source, pass the same `--data-source <id>` for an exact preview — otherwise a product that lives under a different source reads as `added` (push would create it under your target) rather than as a match.

Differences are informational — the command exits `0` even when there are changes. (An invalid local file still exits `1`, as with `push`.)

## Exit codes

`1` partial (some local files invalid) · `2` usage (no account; `push` without `--data-source`; unreadable directory) · `3` auth · `4` config · `5` Merchant API.

::: tip Next step
Run [`gmc preflight`](/reference/preflight) on the pulled directory to catch Merchant Center disapprovals offline, before you `push`.
:::
