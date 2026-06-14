# gmc lfp

**Local Feeds Partnership** (`lfp/v1`) — submit local **stores**, **inventory**, and **sales** for
merchants you manage. Stores: **list / get / insert / delete**; inventory and sales: **insert**
(upsert); merchant state: **get** (diagnostics).

::: warning Provider-side API
This sub-API is for **LFP providers** — calls require an approved Local Feeds Partnership provider
account, so most users will get a `403`. The account `gmc` is scoped to (`--account` /
`GMC_ACCOUNT_ID` / your profile) is the **provider**; `--target-account` names the **merchant** the
data is for. This is the one `gmc` sub-API where the scoped account is _not_ the merchant.
:::

```sh
gmc lfp stores insert --target-account 123456789 --store-code store-1 --store-name "Downtown"
gmc lfp stores list --target-account 123456789
gmc lfp inventory insert --target-account 123456789 --store-code store-1 \
  --offer-id SKU1 --quantity 12 --price 19.99 --currency USD --availability in_stock
gmc lfp sales insert --target-account 123456789 --store-code store-1 \
  --offer-id SKU1 --quantity 1 --price 19.99 --currency USD --sale-time 2026-06-14T10:00:00Z
gmc lfp state get 123456789
```

## Commands

| Command                            | Description                                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| `gmc lfp stores list`              | List a merchant's registered stores (needs `--target-account`) |
| `gmc lfp stores get <id>`          | Fetch one store (id or resource name)                          |
| `gmc lfp stores insert [flags]`    | Insert (create or replace) a store for a target merchant       |
| `gmc lfp stores delete <id>`       | Delete a store                                                 |
| `gmc lfp inventory insert [flags]` | Submit a local inventory entry (upsert)                        |
| `gmc lfp sales insert [flags]`     | Submit a local sale event                                      |
| `gmc lfp state get <merchant>`     | Read a merchant's LFP onboarding state (diagnostics)           |

## Common flags

`stores list` and every `insert` require `--target-account <merchant>` — the merchant's **numeric
Merchant Center id** (an `accounts/{id}` form is accepted and reduced to the id). Inserts also
require `--store-code <code>`, and inventory/sales require `--offer-id <id>`. A `--price <decimal>`
needs `--currency <code>` (the decimal is converted to the API's micros). Inventory `--quantity` is
a non-negative integer; sales `--quantity` may be negative (a return). Pass `--file <path>` (or pipe
stdin) for the full `Lfp*` JSON body; the convenience flags overlay it.

`--json` emits the raw API result (`{ "lfpStores": [...] }` for the stores list, the resource for
get/insert, `{ "deleted": "<id>" }` for delete).

## Exit codes

`0` success · `2` usage (no provider account, missing `--target-account` / `--store-code` /
`--offer-id`, a bad `--quantity` / `--price`, unreadable `--file`) · `3` auth · `5` Merchant API
(incl. `403` if the account isn't an LFP provider).
