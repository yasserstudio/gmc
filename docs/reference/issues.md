# gmc issues

**Render Merchant Center issues with their resolution content** (`issueresolution/v1`). Read-only — shows
the same account- and product-level issues Merchant Center surfaces (why an account is limited, why a
product is disapproved) along with severity, the impacted regions, and Google's prerendered how-to-fix
HTML. Pairs with [`gmc doctor`](/reference/doctor) and [`gmc preflight`](/reference/preflight): _doctor_
checks access, _preflight_ catches problems before upload, _issues_ explains what Google flagged on what
is already live. Targets the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

```sh
gmc issues account
gmc issues product online~en~US~SKU123
gmc issues account --language en-GB --time-zone Europe/London
gmc issues account --json | jq '.issues[] | { title, severity: .impact.severity }'
```

```
2 issue(s):

  [DISAPPROVED] Misrepresentation of self or product
    Your account was flagged for a policy violation.
      • United States — Shopping ads

  [DEMOTED] Missing shipping information
      • United States, United Kingdom — Free listings
```

## Subcommands

| Command                   | Renders                                                   |
| ------------------------- | --------------------------------------------------------- |
| `gmc issues account`      | Account-level issues (`renderaccountissues`)              |
| `gmc issues product <id>` | Item-level issues for one product (`renderproductissues`) |

`<id>` is a bare product id or the full resource `name` from [`gmc products list`](/reference/products).

## Flags

| Flag                | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `--language <code>` | IETF BCP-47 language for rendered content (server default `en-US`) |
| `--time-zone <tz>`  | IANA time zone for rendered times (server default UTC)             |

## Output

Each issue prints `[SEVERITY] title`, the impact message, and a region/destination breakdown. Severity
is the value the API returns for the rendered issue, e.g. `ERROR` or `WARNING`. The full how-to-fix detail is
**HTML** — it is omitted from the table and available under `--json`. `--json` emits `{ "issues": [...] }`
— the raw `RenderedIssue`s, including `prerenderedContent` (the HTML) and `actions`.

> The Merchant API exposes issues only through these POST render calls — there is no plain list. The
> writable `triggeraction` flow (starting a remediation action) is allowlist-gated by Google and is not
> exposed here.

## Exit codes

`2` if no account is given or it is not numeric · `3` auth · `5` Merchant API.
