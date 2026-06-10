# gmc inventory

**Per-store and per-region overrides of a product.** A product's base price/availability can be
overridden for a specific **local** store (`storeCode`) or a **regional** area (`region`) — so Shopping
shows the right stock and price per location. Both are sub-resources of a product and support
**list / insert (upsert) / delete**.

```sh
gmc inventory local list en~US~SKU1
gmc inventory local insert en~US~SKU1 --store-code STORE1 --availability out_of_stock --quantity 0
gmc inventory local delete en~US~SKU1 --store-code STORE1

gmc inventory regional list en~US~SKU1
gmc inventory regional insert en~US~SKU1 --region US-CA --price 18.99 --currency USD
gmc inventory regional delete en~US~SKU1 --region US-CA
```

`<product>` is a product id or full resource name (from [`gmc products list`](/reference/products)).

## Insert: flags or JSON

`insert` builds the entry from convenience flags — or a `--file` JSON base with flags layered on top
for full control:

| Flag                                     | Applies to | Notes                                                                         |
| ---------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `--store-code <code>`                    | local      | The local inventory's id (required unless in `--file`)                        |
| `--region <id>`                          | regional   | The regional inventory's id; must already exist for the account               |
| `--availability <value>`                 | both       | e.g. `in_stock` / `out_of_stock`                                              |
| `--quantity <n>`                         | local      | Non-negative integer stock at the store                                       |
| `--price <amount>` + `--currency <code>` | both       | Decimal price → `{amountMicros, currencyCode}`                                |
| `--file <path>`                          | both       | A `LocalInventory` / `RegionalInventory` JSON base; flags override its fields |

```sh
# full control via JSON, with a flag override
gmc inventory local insert en~US~SKU1 --file store1.json --availability out_of_stock
```

Insert is an **upsert** keyed by `storeCode` / `region` — re-inserting replaces. There's no `get` or
`patch`; use `list` to read and `insert` to change.

::: tip Regions
A regional inventory's `--region` must reference a region already defined for the account (region
_definition_ lives under the Accounts sub-API; CLI support for it is a separate follow-up). Define
regions in Merchant Center, then reference their ids here.
:::

## Output

`list` prints one line per entry (id · availability · quantity/price); `--json` emits
`{ "localInventories": [...] }` or `{ "regionalInventories": [...] }`. `insert` echoes a confirmation
(or the API result with `--json`); `delete` confirms the removed id.

## Exit codes

`0` success · `2` usage (missing `--store-code`/`--region`, a non-integer `--quantity`, a non-decimal
`--price`, or `--price` without a currency) · `3` auth · `5` Merchant API.
