# Getting started

## Prerequisites

- **Node.js 20+**
- A **Google Cloud project** with the **Merchant API enabled**
- A **Merchant Center account** your credential can access

## Install

::: warning Pre-release
The `@gmc-cli/*` packages are not yet published to npm (that lands later in the `0.x` series). For now, run from source.
:::

Once published, gmc will install as a global command:

```sh
npm i -g @gmc-cli/cli
gmc --version
```

To run from source today:

```sh
git clone https://github.com/yasserstudio/gmc.git
cd gmc
pnpm install && pnpm build
node packages/cli/dist/bin.js --help   # or `pnpm --filter @gmc-cli/cli exec gmc --help`
```

## Authenticate

The quickest path is an interactive browser login:

```sh
gmc auth login
gmc auth whoami      # confirm the resolved identity (no network call)
```

gmc also accepts service-account keys and Application Default Credentials — see [Authentication](/guide/authentication).

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
```

Set an account once via a [profile](/guide/configuration) so you can drop the `--account` flag.

## Next steps

- [Authentication](/guide/authentication) — service account, OAuth, ADC
- [Configuration & profiles](/guide/configuration) — config file, env vars, exit codes
- [CLI reference](/reference/) — every command and flag
