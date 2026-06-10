# Installation

`gmc` needs **Node.js ≥ 20**. Pick whichever fits your setup.

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
brew install yasserstudio/gmc/gmc
```

(The formula installs the published npm package and links the `gmc` binary; Homebrew pulls in Node.)

## Standalone binary

Each release attaches prebuilt, self-contained binaries (no Node required) to its
[GitHub release](https://github.com/yasserstudio/gmc/releases) — `gmc-darwin-arm64`,
`gmc-darwin-x64`, `gmc-linux-x64`, `gmc-linux-arm64`. Download the one for your platform, then:

```sh
chmod +x gmc-darwin-arm64
sudo mv gmc-darwin-arm64 /usr/local/bin/gmc
gmc --version
```

## In CI

Don't install — use [`npx @gmc-cli/cli`](/guide/github-action) directly, or the
[GitHub Action](/guide/github-action) / [GitLab recipe](/guide/gitlab-ci).

## Next

Run [`gmc doctor`](/reference/doctor) to verify auth and Merchant API access, then see
[Getting started](/guide/getting-started).
