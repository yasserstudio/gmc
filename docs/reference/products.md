# gmc products

Manage Merchant Center products. Every subcommand operates on the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

The Merchant API splits products in two: a read-only **processed** product (`list` / `get`, with status and item-level issues) and a writable **product input** (`insert` / `delete`). gmc presents both under `gmc products`.

## `gmc products list`

List processed products for the account.

```sh
gmc products list
gmc products list --page-size 50
gmc products list --json   # { "products": [ … ] }
```

| Option            | Description               |
| ----------------- | ------------------------- |
| `--page-size <n>` | Max products per API page |

## `gmc products get <productId>`

Fetch one processed product, with its status and any item-level issues. The id is the composite `{contentLanguage}~{feedLabel}~{offerId}` (as shown by `list`; legacy-local products use a `local~` prefix); the full resource name is also accepted.

```sh
gmc products get en~US~SKU1
gmc products get en~US~SKU1 --json
```

## `gmc products insert`

Insert (create or replace) a product input from a JSON [ProductInput](https://developers.google.com/merchant/api/reference/rest/products_v1/accounts.productInputs), read from `--file` or stdin, under a data source.

```sh
gmc products insert --data-source 11223344 --file product.json
cat product.json | gmc products insert --data-source 11223344
```

| Option               | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| `--data-source <id>` | **Required.** A primary API data source (id or resource name) |
| `--file <path>`      | Read the ProductInput JSON from this file (else stdin)        |

```json
{
  "offerId": "SKU1",
  "contentLanguage": "en",
  "feedLabel": "US",
  "attributes": {
    "title": "Trail Runner",
    "link": "https://shop.com/p/run01",
    "price": { "amountMicros": "49990000", "currencyCode": "USD" },
    "availability": "in_stock"
  }
}
```

::: tip Read-after-write
Inserting succeeds immediately, but the **processed** product (`get` / `list`) is computed asynchronously and may take a few minutes to appear.
:::

## `gmc products delete <productId>`

Delete a product input from a data source.

```sh
gmc products delete en~US~SKU1 --data-source 11223344
```

| Option               | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `--data-source <id>` | **Required.** The data source (id or resource name) to delete from |

## Exit codes

`2` if the account, `--data-source`, or JSON input is missing/invalid · `3` auth · `5` Merchant API.

::: info Data sources
Pass an existing primary API data source via `--data-source`. To create and manage data sources, see [`gmc datasources`](/reference/datasources).
:::
