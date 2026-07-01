<p align="center">
  <img src="./assets/icon-200.png" alt="GMC icon" width="120">
</p>

<p align="center">
  by<br>
  <a href="https://yasser.studio"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/yasser-studio-logo-white.svg"><img src="./assets/yasser-studio-logo.svg" alt="Yasser's Studio" height="30"></picture></a>
</p>

# GMC — Google Merchant Center CLI

**GMC** is a command-line interface for the [Google Merchant API](https://developers.google.com/merchant/api) — the successor to the Content API for Shopping. It gives you typed, scriptable, CI-friendly access to your Merchant Center accounts and product catalog from a single binary, without a browser.

It is built for the **Content API → Merchant API migration** (the Content API is being retired), and around the three things that API makes harder than it should: catching the _silent_ setup failures (`doctor`), validating feeds offline before they get disapproved (preflight), and moving off the Content API cleanly (migrate).

<p align="center">
  <a href="https://www.npmjs.com/package/@gmc-cli/cli"><img src="https://img.shields.io/npm/v/%40gmc-cli%2Fcli?style=for-the-badge&color=1a73e8&label=npm" alt="npm version"></a>
  <a href="https://yasserstudio.github.io/gmc/"><img src="https://img.shields.io/badge/docs-yasserstudio.github.io%2Fgmc-1a73e8?style=for-the-badge" alt="Documentation"></a>
  <a href="https://github.com/marketplace/actions/gmc-google-merchant-center-cli"><img src="https://img.shields.io/badge/marketplace-gmc-1a73e8?style=for-the-badge&logo=github" alt="GitHub Marketplace"></a>
  <a href="https://github.com/yasserstudio/gmc/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/yasserstudio/gmc/ci.yml?branch=main&style=for-the-badge&label=tests&color=1a7f37" alt="CI status"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js" alt="Node.js 20+">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/yasserstudio/gmc?style=for-the-badge&color=1a73e8" alt="MIT License"></a>
</p>

<p align="center"><a href="#install"><strong>Install</strong></a> · <a href="https://yasserstudio.github.io/gmc/guide/getting-started">Getting Started</a> · <a href="https://yasserstudio.github.io/gmc/reference/">CLI Reference</a> · <a href="#roadmap">Roadmap</a></p>

---

## Install

```bash
npm install -g @gmc-cli/cli
```

See the [Installation guide](https://yasserstudio.github.io/gmc/guide/installation) for other methods.

---

## Get started

```bash
gmc auth login                       # 1. sign in with your Google account (or a service-account key for CI)
gmc doctor                           # 2. diagnose auth, GCP registration, and Merchant API access
gmc accounts list                    # 3. see the accounts your credential can reach
gmc --account 123456789 products list   # 4. read the catalog
gmc --account 123456789 feeds pull      # 5. export it to version-controllable files
gmc preflight --dir feeds               # 6. catch disapprovals offline, before you push
```

Set an account once in a [profile](https://yasserstudio.github.io/gmc/guide/configuration) and drop the `--account` flag.

---

## Why GMC?

Most Merchant Center work is still done by hand in the web UI, and the Content API that powered automation is being retired. GMC makes the move scriptable.

|                                            |    **GMC**     | Merchant Center UI | Raw API / client libs |
| ------------------------------------------ | :------------: | :----------------: | :-------------------: |
| Typed CLI, one binary                      |       ✅       |         —          |  you write the code   |
| `--json` + classed exit codes              |       ✅       |         —          |          DIY          |
| Diagnoses the silent GCP-registration trap |  ✅ `doctor`   |         —          |           —           |
| Catalog as version-controllable files      |       ✅       |         —          |          DIY          |
| Offline feed-compliance preflight          | ✅ `preflight` |         —          |           —           |
| Content API → Merchant API migrate         |  ✅ `migrate`  |         —          |           —           |

The differentiators — `doctor`, `preflight`, and `migrate` — were front-loaded, and breadth has since caught up: **all 12 GA (`v1`) Merchant API sub-APIs are now covered**. See the [roadmap](#roadmap).

---

## Authenticate

Four ways in, resolved in order. See [Authentication](https://yasserstudio.github.io/gmc/guide/authentication).

```bash
gmc auth login                 # interactive OAuth (browser)
gmc auth login --no-browser    # headless / remote — prints the URL
gmc auth whoami                # resolved identity (no network call)
gmc auth test                  # confirm the credential mints a token
```

For CI, point GMC at a service-account key: `export GMC_SERVICE_ACCOUNT=/path/to/key.json` (or the standard `GOOGLE_APPLICATION_CREDENTIALS`). Application Default Credentials (`gcloud auth application-default login`) also work.

## Diagnose

`gmc doctor` validates your credential, mints a token, and probes the Merchant API — catching the trap where a credential authenticates fine but the Cloud project was never registered, so every call returns a cryptic empty result.

```bash
gmc doctor
gmc doctor --json | jq '.checks[] | select(.status != "pass")'
```

## Accounts

```bash
gmc accounts list                  # accounts your credential can access
gmc accounts get 123456789         # the raw account resource
gmc accounts info 123456789        # a profile: account + business info + homepage
gmc accounts update 123456789 --name "My Store" --time-zone America/New_York
gmc accounts business-info update 123456789 --file business-info.json
gmc accounts homepage set https://mystore.com 123456789   # set / claim / unclaim
gmc accounts users add jane@example.com --access-rights STANDARD,ADMIN 123456789
gmc accounts create --name "Sub" --time-zone America/New_York --language en-US --aggregator 123456789
gmc accounts delete 987654321 --yes        # irreversible (--yes required)
gmc accounts autofeed update 123456789 --enable-products true
gmc accounts shipping get 123456789 --json > shipping.json   # edit, then `shipping set --file`
gmc accounts return-policies list 123456789
```

## Products

The Merchant API splits products into a read-only **processed** resource and a writable **product input**. gmc presents both under `gmc products`.

```bash
gmc products list --page-size 50              # processed products (status + issues)
gmc products get en~US~SKU1            # one product, with item-level issues
gmc products insert --data-source 11223344 --file product.json   # create/replace
cat product.json | gmc products insert --data-source 11223344    # …or from stdin
gmc products delete en~US~SKU1 --data-source 11223344
```

## Data sources

A data source is the feed your products live in. Create a primary feed (API push or scheduled fetch), then insert against it.

```bash
gmc datasources create --name "API feed" --content-language en --feed-label US
gmc datasources list
gmc datasources update <id> --name "Renamed feed"
gmc datasources fetch <id>          # trigger an immediate pull (scheduled feeds)
gmc datasources delete <id>
```

## Feeds as code

Pull your catalog to version-controllable files — one push-ready product per file — then commit, diff, review, and push back.

```bash
gmc feeds pull --dir feeds                  # one JSON file per product
gmc feeds diff --data-source 123            # preview what push would change
gmc feeds push --dir feeds --data-source 123
```

---

## Preflight

Catch Merchant Center disapprovals **offline**, before you upload — no API call, no auth. Run it on a pulled directory, a single file, or (with `--remote`) the live catalog. It exits non-zero on gating findings, so it drops straight into CI.

```bash
gmc preflight --dir feeds        # scan the pulled catalog
gmc preflight --json             # full machine-readable report
```

Configure rule severities, ignores, and strict mode in a project-local `.gmcpreflightrc`. The engine checks required attributes, value formats, policy / disapproval triggers, and SEO optimization (30 rules across four families).

---

## CI/CD

Every command supports `--json` and uses classed exit codes, so pipelines can branch on the failure type.

```yaml
# GitHub Actions — preflight gate with annotations + job summary
- uses: yasserstudio/gmc@v1
  with:
    args: "--dir feeds --strict"
```

The [GitHub Action](https://yasserstudio.github.io/gmc/guide/github-action) runs `preflight` with **inline PR annotations**, a **job summary** of findings, and **structured outputs** (`ok`, `scanned`, `errors`, `warnings`, `report`). For authenticated commands:

```yaml
- uses: yasserstudio/gmc@v1
  with:
    command: reports check
    account: "123456789"
    credentials: ${{ secrets.GMC_SERVICE_ACCOUNT_KEY }}
    args: "--metric clicks --threshold 100"
```

| Code | Meaning                                  |
| ---- | ---------------------------------------- |
| `0`  | Success                                  |
| `1`  | General error                            |
| `2`  | Usage (bad arguments)                    |
| `3`  | Authentication error                     |
| `4`  | Configuration error                      |
| `5`  | Merchant API error                       |
| `6`  | Preflight found gating compliance issues |

A [GitHub Action](https://yasserstudio.github.io/gmc/guide/github-action) and a [GitLab CI recipe](https://yasserstudio.github.io/gmc/guide/gitlab-ci) are available for drop-in pipeline integration.

---

## MCP Server

`gmc mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io/) server over stdio — AI assistants like Claude Desktop, Cursor, and VS Code Copilot can call gmc tools directly.

```json
{
  "mcpServers": {
    "gmc": {
      "command": "gmc",
      "args": ["mcp"]
    }
  }
}
```

12 tools: `doctor`, `accounts_list`, `accounts_get`, `products_list`, `products_get`, `products_insert`, `products_delete`, `datasources_list`, `issues_account`, `quota_list`, `reports_query`, `preflight`. See the [MCP reference](https://yasserstudio.github.io/gmc/reference/mcp).

---

## Packages

A TypeScript monorepo (pnpm + Turborepo). Use the `gmc` command, or import the packages as a typed Merchant API SDK.

| Package                                    | Description                                                 |
| ------------------------------------------ | ----------------------------------------------------------- |
| [`@gmc-cli/cli`](packages/cli)             | CLI entry point — the `gmc` command                         |
| [`@gmc-cli/core`](packages/core)           | Command orchestration, `doctor`, exit-code conventions      |
| [`@gmc-cli/api`](packages/api)             | Typed Merchant API client (rate limiter, retry, pagination) |
| [`@gmc-cli/auth`](packages/auth)           | Authentication — service account, OAuth, ADC                |
| [`@gmc-cli/config`](packages/config)       | Configuration loading and profiles                          |
| [`@gmc-cli/preflight`](packages/preflight) | Offline feed-compliance rule engine + `.gmcpreflightrc`     |
| [`@gmc-cli/migrate`](packages/migrate)     | Content API → Merchant API transform + feed-label checker   |
| [`@gmc-cli/mcp`](packages/mcp)             | MCP server — expose gmc tools to AI assistants              |

---

## Roadmap

GMC launched at `v1.0.0` and ships small, frequent **patch** releases (`v1.0.x`) — new commands land as patches.

| Phase | Versions        | Theme                                                                                                                                          | Status |
| ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| 0     | v0.0            | Scaffold — monorepo, `gmc` shell, docs site                                                                                                    |   ✅   |
| 1     | v0.1–v0.4       | Spike pt 1 — auth, CLI shell, `doctor`                                                                                                         |   ✅   |
| 2     | v0.5–v0.7       | Spike pt 2 — typed client, accounts, products                                                                                                  |   ✅   |
| 3     | v0.8–v0.9.2     | Feeds as code — data sources, pull, push, diff                                                                                                 |   ✅   |
| 4     | v0.9.3–v0.9.5   | **Preflight** — offline feed-compliance scanner                                                                                                |   ✅   |
| 5     | v0.9.6–v0.9.8   | **Migrate** — Content API → Merchant API assistant                                                                                             |   ✅   |
| 6     | v0.9.9–v0.9.10  | Inventories + promotions                                                                                                                       |   ✅   |
| 7     | v0.9.11–v0.9.13 | Reports — performance, visibility, price insights                                                                                              |   ✅   |
| 8     | v0.9.14–v0.9.16 | CI/CD — GitHub Action, GitLab recipe, exit-code hardening                                                                                      |   ✅   |
| 9     | v0.9.17–v1.0.0  | Polish & launch → **v1.0.0**                                                                                                                   |   ✅   |
| 10    | v1.0.2–v1.0.14  | Feature surface — `regions`, account mgmt, `notifications`, `quota`, `issues`, `conversions`, `lfp` → **all 11 Merchant API sub-APIs covered** |   ✅   |
| 11    | v1.0.15         | DX — GitHub Action (annotations + summary), MCP server (12 tools for AI assistants), SEO preflight rules                                       |   ✅   |
| 12    | v1.0.16         | `ordertracking` — order tracking signals (last GA sub-API; **v1 surface complete**)                                                            |   ✅   |

Full detail in the [roadmap](https://yasserstudio.github.io/gmc/guide/roadmap) · shipped work in the [changelog](CHANGELOG.md) · the story in the [devlog](https://yasserstudio.github.io/gmc/devlog/).

---

## Documentation

Full docs at **[yasserstudio.github.io/gmc](https://yasserstudio.github.io/gmc/)**:

- [Getting started](https://yasserstudio.github.io/gmc/guide/getting-started)
- [Authentication](https://yasserstudio.github.io/gmc/guide/authentication)
- [Configuration & profiles](https://yasserstudio.github.io/gmc/guide/configuration)
- [CLI reference](https://yasserstudio.github.io/gmc/reference/)

---

## License

Free to use. Released under the [MIT License](LICENSE).

---

<p align="center"><sub>Made by <a href="https://yasser.studio">Yasser's Studio</a> · <a href="https://www.linkedin.com/in/yasserberrehail/">LinkedIn</a> · <a href="https://x.com/yassersstudio">X</a> · <a href="mailto:hello@yasser.studio">hello@yasser.studio</a></sub></p>

<p align="center"><sub>GMC is an independent project. Not affiliated with, endorsed by, or sponsored by Google LLC. "Google Merchant Center", "Google Shopping", and "Google" are trademarks of Google LLC.</sub></p>
