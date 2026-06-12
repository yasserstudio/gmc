# gmc accounts

Inspect **and manage** Merchant Center accounts. Every command targets the account given as an argument, or the one resolved from `--account` / `GMC_ACCOUNT_ID` / your profile. Reads: `list` / `get` / `info` (+ `business-info`/`homepage` `get`). Profile writes: `update`, `business-info update`, and `homepage set` / `claim` / `unclaim`. Access: `users list` / `get` / `add` / `update` / `remove`. Lifecycle: `create` / `delete`.

## `gmc accounts list`

List accounts your credential can access.

```sh
gmc accounts list
gmc accounts list --json   # { "accounts": [ … ] }
```

## `gmc accounts get [accountId]`

Fetch a single account resource.

```sh
gmc accounts get 123456789
gmc accounts get --json            # uses --account / profile
```

`--json` emits the raw `Account` object.

## `gmc accounts info [accountId]`

Show an account **profile** — the account composed with its business info and homepage (claim status, address, customer service).

```sh
gmc accounts info 123456789
```

```
Account      My Store (123456789)
Type         standalone
Time zone    America/New_York · en-US
Homepage     https://mystore.com (claimed ✓)
Address      123 Main St, Austin, TX, 78701, US
Support      support@mystore.com
```

`--json` emits `{ account, businessInfo, homepage }`; `businessInfo` and `homepage` are `null` when the account has none.

## `gmc accounts update [accountId]`

Patch the account. Only the fields you pass change (the `updateMask` is derived from them, or set
it explicitly with `--update-mask`).

```sh
gmc accounts update 123456789 --name "My Store" --time-zone America/New_York --language en-US
gmc accounts update --adult-content false        # uses --account / profile
```

| Flag                     | Sets                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `--name <name>`          | `accountName` (no punctuation or `/`, `_`)                  |
| `--adult-content <bool>` | `adultContent` — pass `true` or `false`                     |
| `--time-zone <id>`       | `timeZone` (IANA id, e.g. `America/New_York`)               |
| `--language <code>`      | `languageCode` (BCP-47, e.g. `en-US`)                       |
| `--file <path>`          | A full `Account` JSON body (output-only fields are ignored) |
| `--update-mask <fields>` | Explicit field mask                                         |

`--json` emits the updated `Account`.

## `gmc accounts business-info` — `get` / `update`

`get` reads the business info on its own (the same data `info` folds in). `update` patches it from a
JSON body — `address` and `customerService` are nested objects, so pass them via `--file`. The
business `phone` is **output-only** (set/verified in Merchant Center) and is ignored on write, as are
`name` and `phoneVerificationState`, so a body saved from `info`/`get` re-applies cleanly.

```sh
gmc accounts business-info get 123456789
gmc accounts business-info update 123456789 --file business-info.json
gmc accounts business-info update 123456789 --korean-brn 1234567890
```

```json
{
  "address": { "regionCode": "US", "addressLines": ["123 Main St"], "locality": "Austin" },
  "customerService": { "email": "support@mystore.com", "uri": "https://mystore.com/help" }
}
```

| Flag                     | Sets                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `--file <path>`          | A `BusinessInfo` JSON body (`address`, `customerService`, `koreanBusinessRegistrationNumber`) |
| `--korean-brn <number>`  | `koreanBusinessRegistrationNumber` (10 digits, Korea only)                                    |
| `--update-mask <fields>` | Explicit field mask                                                                           |

## `gmc accounts homepage` — `get` / `set` / `claim` / `unclaim`

Manage the account's online-store homepage URI and its claim status.

```sh
gmc accounts homepage get 123456789
gmc accounts homepage set https://mystore.com 123456789
gmc accounts homepage claim 123456789 --overwrite   # take the claim from another account
gmc accounts homepage unclaim 123456789
```

`set` sets the URI (`updateHomepage`). `claim` claims it for this account — pass `--overwrite` to
take a claim another account currently holds. `--json` emits the resulting `Homepage`.

## `gmc accounts users` — `list` / `get` / `add` / `update` / `remove`

Manage **who can access the account** and their access rights. The user's email is the id (`me`
resolves to the calling user).

```sh
gmc accounts users list 123456789
gmc accounts users get jane@example.com 123456789
gmc accounts users add jane@example.com --access-rights STANDARD,ADMIN 123456789
gmc accounts users update jane@example.com --access-rights ADMIN 123456789
gmc accounts users remove jane@example.com 123456789
```

| Command                                                   | Description                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `users list [accountId]`                                  | List users — email · access rights · `[state]` (`PENDING`/`VERIFIED`) |
| `users get <email> [accountId]`                           | Fetch one user (`me` allowed)                                         |
| `users add <email> --access-rights <list> [accountId]`    | Add a user                                                            |
| `users update <email> --access-rights <list> [accountId]` | Replace a user's access rights                                        |
| `users remove <email> [accountId]`                        | Remove a user                                                         |

`--access-rights` is a comma-separated list (case-insensitive, deduped) of: **`STANDARD`**,
`READ_ONLY`, **`ADMIN`**, `PERFORMANCE_REPORTING`, `API_DEVELOPER`. It's required on `add` and
`update` (it's the only writable field; `update` replaces the whole set). `--json` emits the raw
`User` (`{ users }` for list, `{ "removed": "<email>" }` for remove).

## `gmc accounts create`

Create and configure an account (`accounts:createAndConfigure`) — most commonly a **sub-account**
under an advanced/aggregator account. The API requires the account's `accountName` / `timeZone` /
`languageCode` **and** at least one service relationship.

```sh
gmc accounts create --name "West Coast Store" --time-zone America/Los_Angeles \
  --language en-US --aggregator 123456789
gmc accounts create --file account-request.json   # full body (users, aliases, other services)
```

| Flag                     | Builds                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `--name <name>`          | `account.accountName` (required)                              |
| `--time-zone <id>`       | `account.timeZone` (IANA id)                                  |
| `--language <code>`      | `account.languageCode` (BCP-47)                               |
| `--adult-content <bool>` | `account.adultContent`                                        |
| `--aggregator <id>`      | A `service` entry making this a sub-account of account `<id>` |
| `--file <path>`          | A full `createAndConfigure` body — overlaid by the flags      |

The `--file` body is kept whole (it can carry `account`, `service`, `user`, `setAlias`); the flags
build/override `account` and append the `--aggregator` service. A create needs an `accountName` and
at least one service (from `--aggregator` or `--file`). `--json` emits the created `Account`. Add
users afterward with [`gmc accounts users add`](#gmc-accounts-users-list-get-add-update-remove).

```json
{
  "account": {
    "accountName": "West Coast Store",
    "timeZone": { "id": "America/Los_Angeles" },
    "languageCode": "en-US"
  },
  "service": [{ "accountAggregation": {}, "provider": "accounts/123456789" }]
}
```

## `gmc accounts delete`

**Irreversibly** delete an account. The id is a required argument (no `--account`/profile fallback),
and `--yes` is required to confirm.

```sh
gmc accounts delete 123456789 --yes
gmc accounts delete 123456789 --yes --force   # also when it has sub-accounts or processed offers
```

`--yes` confirms the deletion (the command refuses without it). `--force` maps to the API's `force`
— it lets you delete an account that still provides services to other accounts or has processed
offers. `--json` emits `{ "deleted": "<id>" }`.

## Exit codes

`2` usage (no/non-numeric account id, nothing-to-update, a non-boolean `--adult-content`, a missing
or invalid `--access-rights`, `create` without a name/service, `delete` without `--yes`, an
unreadable/invalid `--file`) · `3` auth · `5` Merchant API.
