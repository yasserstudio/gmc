# gmc regions

**Define geographic regions for your account** — named areas (by postal codes, Google geotarget
criteria, or a radius) that you then reference from [regional inventory](/reference/inventory) and
regional shipping rates. Full CRUD: **list / get / create / update / delete**.

```sh
gmc regions list
gmc regions get usa-ca
gmc regions create usa-ca --display-name California --region-code US --postal-codes 90000-90999,94000
gmc regions create socal --geotarget-ids 21137,21138
gmc regions update usa-ca --display-name "Southern California"
gmc regions delete usa-ca
```

## Commands

| Command                                                             | Description                                        |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `gmc regions list [--page-size <n>]`                                | List regions defined for the account               |
| `gmc regions get <region>`                                          | Fetch one region (id or resource name from `list`) |
| `gmc regions create <regionId> [area flags]`                        | Create a region (its id is supplied by you)        |
| `gmc regions update <region> [area flags] [--update-mask <fields>]` | Patch a region — only the fields you pass change   |
| `gmc regions delete <region>`                                       | Delete a region                                    |

## Defining the area

A region is defined by **exactly one** area. Pick how with the flags below, or pass a full `Region`
body via `--file` (the only way to define a **radius** area):

| Flag                                           | Builds                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--postal-codes <list>` + `--region-code <cc>` | A postal-code area. Comma-separated codes/ranges, e.g. `90000-90999,94000`. `--region-code` is a CLDR territory code (e.g. `US`). |
| `--geotarget-ids <list>`                       | A geotarget area from Google location criteria ids (comma-separated).                                                             |
| `--display-name <name>`                        | A human-readable label (optional, combines with any area).                                                                        |

A `begin-end` token is an inclusive postal-code range; a bare token is a single code. A ZIP+4 like
`90210-1234` would be read as a range — pass those through `--file`.

```json
{
  "displayName": "California",
  "postalCodeArea": {
    "regionCode": "US",
    "postalCodes": [{ "begin": "90000", "end": "90999" }, { "begin": "94000" }]
  }
}
```

`update` sends only the fields you pass (the `updateMask` is derived from them, or set it explicitly
with `--update-mask`). Output-only fields (`name`, `regionalInventoryEligible`, `shippingEligible`)
in a `--file` body are ignored, so a body saved from `regions get` can be re-applied as-is.

## Output

`list` prints `id · display name · area summary`; `get` adds the inventory/shipping **eligibility**
flags (output-only — a region must cover enough area to be usable). `--json` emits the raw API
result (`{ "regions": [...] }` for list, the resource for get/create/update, `{ "deleted": "<id>" }`
for delete).

::: tip Read-after-write
`create` returns the region immediately, but the Merchant API is eventually consistent: a `get` / `update` / `delete` / `list` in the next instant may briefly return `404` (or omit it) until it propagates — usually a few seconds, up to ~20s. If you script `create` followed by another call on the new id, allow a short delay or retry.
:::

## Exit codes

`0` success · `2` usage (no/both areas, missing `--region-code`, unreadable `--file`, bad
`--page-size`) · `3` auth · `5` Merchant API.
