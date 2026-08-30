---
description: "Install the GMC CLI four ways — npm, npx, Homebrew, or a standalone binary (no Node). The npm and npx paths need Node.js 20+."
---

# Installation

Four ways in — **npm**, **npx**, **Homebrew**, or a **standalone binary** (no Node needed). The npm and npx paths require **Node.js ≥ 20**; pick whichever fits your setup.

## npm (recommended)

```sh
npm install -g @gmc-cli/cli
gmc --version
```

Or run it without installing:

```sh
npx @gmc-cli/cli doctor
```

## Homebrew

```sh
brew install yasserstudio/tap/gmc
```

The formula installs the matching standalone binary for your platform; Node.js is not required.

## Standalone binary

Each release attaches prebuilt, self-contained binaries (no Node required) to its
[GitHub release](https://github.com/yasserstudio/gmc/releases). Choose the asset that matches your
machine:

| Platform             | Asset              |
| -------------------- | ------------------ |
| macOS, Apple silicon | `gmc-darwin-arm64` |
| macOS, Intel         | `gmc-darwin-x64`   |
| Linux, x86-64        | `gmc-linux-x64`    |
| Linux, ARM64         | `gmc-linux-arm64`  |

For example, on an Apple-silicon Mac:

```sh
chmod +x gmc-darwin-arm64
sudo mv gmc-darwin-arm64 /usr/local/bin/gmc
gmc --version
```

## In CI

Don't install — use [`npx @gmc-cli/cli`](/guide/github-action) directly, or the
[GitHub Action](/guide/github-action) / [GitLab recipe](/guide/gitlab-ci).

## Verify and continue

Run [`gmc doctor`](/reference/doctor) to verify auth and Merchant API access, then see
[Getting started](/guide/getting-started).
