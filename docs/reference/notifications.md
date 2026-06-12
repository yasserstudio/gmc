# gmc notifications

**Subscribe to Merchant Center change events** delivered to a **webhook** (`notifications/v1`
`accounts.notificationsubscriptions`). When a registered event fires, the API sends an HTTP `POST`
to your `callBackUri`. Full CRUD: **list / get / create / update / delete**. Every subcommand
operates on the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

```sh
gmc notifications create --callback-uri https://example.com/hook --all-managed-accounts
gmc notifications list
gmc notifications get <id>
gmc notifications update <id> --target-account 123456789
gmc notifications delete <id>
```

## Commands

| Command                                                          | Description                                      |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| `gmc notifications list`                                         | List subscriptions for the account               |
| `gmc notifications get <id>`                                     | Fetch one subscription (id or resource name)     |
| `gmc notifications create [flags]`                               | Create a subscription (its id is auto-generated) |
| `gmc notifications update <id> [flags] [--update-mask <fields>]` | Patch a subscription — only the fields you pass  |
| `gmc notifications delete <id>`                                  | Delete a subscription                            |

## Defining a subscription

| Flag                     | Sets                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `--callback-uri <url>`   | `callBackUri` — the **HTTPS** webhook that receives the POST (required on `create`)  |
| `--event <type>`         | `registeredEvent` — currently only `PRODUCT_STATUS_CHANGE` (the default on `create`) |
| `--all-managed-accounts` | Subscribe for **every** managed account (advanced accounts)                          |
| `--target-account <id>`  | Subscribe for a **single** account id (becomes `accounts/{id}`)                      |

A subscription targets **exactly one** of `--all-managed-accounts` or `--target-account` (required
on `create`, mutually exclusive). The callback must be an `https://` URL. `update` changes only the
fields you pass (the `updateMask` is derived from them, or set it with `--update-mask`) — and when an
`update` switches the target (e.g. `--all-managed-accounts` on a subscription that had a
`--target-account`), the other side is cleared automatically so the two never both end up set.

## Output

`list` prints `id · event · target · callBackUri` (`target` is `all-managed` or `accounts/{id}`);
`get` shows the same as detail lines. `--json` emits the raw API result (`{ "notifications": [...] }`
for list, the resource for get/create/update, `{ "deleted": "<id>" }` for delete).

## Exit codes

`0` success · `2` usage (no account, missing/invalid `--callback-uri`, a non-https callback, both or
neither target, an unknown `--event`, nothing-to-update) · `3` auth · `5` Merchant API.
