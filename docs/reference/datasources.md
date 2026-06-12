# gmc datasources

Manage Merchant Center **data sources** — the container every product feed lives in. A _primary product_ data source can receive products via the API (what [`products insert`](/reference/products) targets) or via a scheduled file fetch. Every subcommand operates on the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

## `gmc datasources list`

List data sources for the account.

```sh
gmc datasources list
gmc datasources list --json   # { "dataSources": [ … ] }
```

```
55  API feed   primary product · API
56  Nightly    primary product · FILE
```

## `gmc datasources get <dataSourceId>`

Fetch one data source. The id is shown by `list`; a full resource name is also accepted.

```sh
gmc datasources get 55
gmc datasources get 55 --json
```

## `gmc datasources create`

Create a primary product data source from flags, or any data source from a full JSON body.

```sh
# API feed — what `products insert` needs
gmc datasources create --name "API feed" --content-language en --feed-label US

# Scheduled file fetch
gmc datasources create --name "Nightly" --content-language en --feed-label US \
  --fetch-url https://shop.com/feed.xml --fetch-schedule daily

# Any data source type — full DataSource JSON via --file or stdin
gmc datasources create --file datasource.json
cat datasource.json | gmc datasources create
```

| Option                      | Description                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--name <displayName>`      | Display name (required in flag mode)                                                                                     |
| `--type <type>`             | Source type — `primary` (default); use `--file` for other types                                                          |
| `--content-language <lang>` | Content language, e.g. `en` (required)                                                                                   |
| `--feed-label <label>`      | Feed label, e.g. `US` (required)                                                                                         |
| `--legacy-local`            | Boolean flag — present means a legacy-local feed for in-store-only products; absent (default) means a normal online feed |
| `--countries <list>`        | Comma-separated target countries, e.g. `US,CA`                                                                           |
| `--fetch-url <uri>`         | Make it a scheduled file fetch from this URL                                                                             |
| `--fetch-schedule <freq>`   | `daily` (default), `weekly`, or `monthly`                                                                                |
| `--fetch-time <HH:MM>`      | Fetch time of day (24-hour)                                                                                              |
| `--fetch-timezone <tz>`     | Fetch time zone, e.g. `America/New_York`                                                                                 |
| `--fetch-filename <name>`   | Fetched file name (default derived from `--fetch-url`)                                                                   |
| `--file <path>`             | Create from a full DataSource JSON file (else stdin)                                                                     |

Input precedence: `--file` → flags → piped stdin. Passing both `--file` and flags is an error. `--json` returns the created `DataSource`.

Then push products into the new source:

```sh
gmc products insert --data-source <id> --file product.json
```

## `gmc datasources update <dataSourceId>`

Patch a data source — only the fields you pass change (the `updateMask` is derived from them, or set
it explicitly with `--update-mask`).

```sh
gmc datasources update 55 --name "Renamed feed"
gmc datasources update 55 --file datasource.json        # or pipe a body on stdin
```

| Flag                     | Sets                                            |
| ------------------------ | ----------------------------------------------- |
| `--name <displayName>`   | `displayName`                                   |
| `--file <path>`          | A `DataSource` JSON body (else read from stdin) |
| `--update-mask <fields>` | Explicit field mask                             |

Output-only fields (`name`, `dataSourceId`, `input`) in a `--file` body are ignored, so a body saved
from `datasources get` re-applies cleanly. When you pass both `--file` and `--name`, `--name` wins
(it overrides the body's `displayName`). A field named in the `updateMask` but absent from the body
is **deleted** by the API. `--json` emits the updated `DataSource`.

## `gmc datasources fetch <dataSourceId>`

Trigger an immediate fetch of a **scheduled file feed**, outside its normal schedule. Only works on
file-input (scheduled-fetch) data sources — the API rejects API-input feeds.

```sh
gmc datasources fetch 55
gmc datasources fetch 55 --json   # { "fetched": "55" }
```

## `gmc datasources delete <dataSourceId>`

```sh
gmc datasources delete 55
gmc datasources delete 55 --json   # { "deleted": "55" }
```

## Exit codes

`2` for usage (no account, missing/invalid flags, conflicting `--file`+flags, nothing-to-update, bad JSON) · `3` auth · `5` Merchant API.
