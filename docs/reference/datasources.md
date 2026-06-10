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

## `gmc datasources delete <dataSourceId>`

```sh
gmc datasources delete 55
gmc datasources delete 55 --json   # { "deleted": "55" }
```

## Exit codes

`2` for usage (no account, missing/invalid flags, conflicting `--file`+flags, bad JSON) · `3` auth · `5` Merchant API.

::: tip Not yet implemented
`datasources update` and `datasources fetch` (trigger an immediate pull) are not yet implemented.
:::
