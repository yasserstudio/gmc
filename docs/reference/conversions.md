# gmc conversions

**Manage conversion sources** — where a Merchant Center account measures conversions
(`conversions/v1` `accounts.conversionSources`). A source is either a **Merchant Center
destination** or a **Google Analytics property link**. Full lifecycle: **list / get / create /
update / delete / undelete** (`delete` archives, `undelete` restores). Every subcommand operates on
the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

```sh
gmc conversions create --ga-property 123456789
gmc conversions create --merchant-center --currency USD --display-name "Store"
gmc conversions list
gmc conversions get <id>
gmc conversions update <id> --display-name "New name"
gmc conversions delete <id>     # archives (soft-delete)
gmc conversions undelete <id>   # restores
```

## Commands

| Command                                                   | Description                                             |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `gmc conversions list`                                    | List conversion sources for the account                 |
| `gmc conversions get <id>`                                | Fetch one source (id or resource name)                  |
| `gmc conversions create [flags]`                          | Create a source (its id is auto-generated)              |
| `gmc conversions update <id> [flags] [--update-mask <m>]` | Patch a source — only the fields you pass               |
| `gmc conversions delete <id>`                             | Archive a source (soft-delete; restore with `undelete`) |
| `gmc conversions undelete <id>`                           | Restore a previously archived source                    |

## Defining a source

A source is **one type** — pass the flags for a Google Analytics link **or** a Merchant Center
destination (not both), or a full `--file` body.

| Flag                    | Sets                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `--ga-property <id>`    | `googleAnalyticsLink.propertyId` — link a Google Analytics property         |
| `--merchant-center`     | Create a `merchantCenterDestination` source                                 |
| `--currency <code>`     | `merchantCenterDestination.currencyCode` (ISO 4217; **required** for MC)    |
| `--display-name <name>` | `merchantCenterDestination.displayName`                                     |
| `--file <path>`         | Full `ConversionSource` JSON (else stdin); for nested `attributionSettings` |

`--file` and the convenience flags are mutually exclusive. Output-only fields (`name`, `state`,
`controller`, `expireTime`) in a `--file` body are dropped, so a body saved from `get` re-applies.

## Updating

`update` patches only what you pass. The convenience flags target Merchant Center fields with a
**nested** `updateMask` (so the rest of the destination is untouched):

| Flag                    | Patches                                  | Mask                                     |
| ----------------------- | ---------------------------------------- | ---------------------------------------- |
| `--display-name <name>` | `merchantCenterDestination.displayName`  | `merchantCenterDestination.displayName`  |
| `--currency <code>`     | `merchantCenterDestination.currencyCode` | `merchantCenterDestination.currencyCode` |
| `--file <path>`         | Replaces the named source object         | its top-level keys (or `--update-mask`)  |

The Google Analytics `propertyId` is immutable, so there is no update flag for it.

## Output

`list` prints `id · state · type` (type is `Merchant Center "name" (CUR)` or `GA property <id>`);
`get` adds `state` / `controller` / `expireTime` detail lines. `--json` emits the raw API result
(`{ "conversionSources": [...] }` for list, the resource for get/create/update/undelete,
`{ "deleted": "<id>" }` for delete).

::: tip Read-after-write
`create` returns the source immediately, but the Merchant API is eventually consistent: a `get` /
`update` / `delete` in the next instant may briefly return `404` until it propagates — usually a few
seconds, up to ~20s. If you script `create` followed by another call on the new id, allow a short
delay or retry.
:::

## Exit codes

`0` success · `2` usage (no account, no/both source types, `--merchant-center` without `--currency`,
`--file` with convenience flags, nothing-to-update) · `3` auth · `5` Merchant API.
