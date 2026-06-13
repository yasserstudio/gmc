---
description: "Install GMC, authenticate, run gmc doctor, and make your first Google Merchant API calls from the terminal."
---

# Getting started

## Prerequisites

- **Node.js 20+**
- A **Google Cloud project** with the **Merchant API enabled**
- A **Merchant Center account** your credential can access

## Install

```sh
npm install -g @gmc-cli/cli
gmc --version
```

See the [Installation](/guide/installation) guide for other methods (local build from source, pnpm, etc.).

## Authenticate

The quickest path is an interactive browser login:

```sh
gmc auth login
gmc auth whoami      # confirm the resolved identity (no network call)
```

GMC also accepts service-account keys and Application Default Credentials — see [Authentication](/guide/authentication).

## Diagnose

Before anything else, run the doctor. It validates your credential, mints a token, and probes the Merchant API — catching the silent GCP-registration trap:

```sh
gmc doctor
gmc doctor --json    # machine-readable, for CI
```

## First commands

```sh
# Which Merchant Center accounts can this credential see?
gmc accounts list

# Inspect one account (set --account or a profile, or pass the id)
gmc accounts info 123456789

# List products for the configured account
gmc --account 123456789 products list

# Export the catalog to version-controllable files
gmc --account 123456789 feeds pull
```

Set an account once via a [profile](/guide/configuration) so you can drop the `--account` flag.

## Next steps

- [Authentication](/guide/authentication) — service account, OAuth, ADC
- [Configuration & profiles](/guide/configuration) — config file, env vars, exit codes
- [CLI reference](/reference/) — every command and flag, including [`datasources`](/reference/datasources) and [`feeds`](/reference/feeds)
