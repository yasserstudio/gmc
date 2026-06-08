# gmc feeds

**Feeds as code** — sync your catalog to version-controllable local files. `pull` exports the account's products to a directory; `push` and `diff` arrive in v0.10–v0.11. Operates on the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

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

Commit the directory to version control, review changes as ordinary diffs, then (v0.10) push it back.

Products with no derivable id, a filename collision, or a write error are **skipped** and counted (the run continues); `--json` includes a `skipped` count when non-zero.

## Exit codes

`2` for usage (no account) · `3` auth · `5` Merchant API.

::: tip Coming next
`gmc feeds push` (v0.10) re-applies a directory to a `--data-source`, and `gmc feeds diff` (v0.11) shows what would change before pushing.
:::
