# gmc accounts

Inspect Merchant Center accounts. `get` / `info` target the account given as an argument, or the one resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

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

## Exit codes

`2` if no account id is given or it is not numeric · `3` auth · `5` Merchant API.
