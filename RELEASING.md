# Releasing gmc

The release pipeline is automated with [Changesets](https://github.com/changesets/changesets)
and GitHub Actions, modelled on the sibling GPC project. Only **`@gmc-cli/cli`** is
published to npm — the other `@gmc-cli/*` packages are `private` and bundled into the
cli's `dist`.

## One-time setup (required for automation)

| Secret / setting                             | Where                                                                              | Why                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **npm Trusted Publisher** for `@gmc-cli/cli` | npmjs.com → package → Settings → Trusted Publisher → add this repo + `release.yml` | Lets CI **stage** publishes via OIDC — no long-lived npm token, and you approve the final publish with your passkey.                                                      |
| **`HOMEBREW_TAP_TOKEN`**                     | repo → Settings → Secrets → Actions                                                | A PAT with `contents:write` on `yasserstudio/homebrew-tap` so `release-binaries.yml` can dispatch the formula bump (the default `GITHUB_TOKEN` can't reach another repo). |
| npm **≥ 11.15**                              | local + CI (handled)                                                               | Staged publishing. `release.yml` upgrades CI automatically.                                                                                                               |
| _(optional)_ **Dependency Graph**            | repo → Settings → Code security                                                    | Enables dependency insights and a future `dependency-review` CI job. Vulnerabilities are gated by `pnpm audit --prod` + the Socket app.                                   |

## The flow

1. **Land changes** with a changeset: `pnpm changeset` (pick `@gmc-cli/cli` + bump level),
   commit it in your PR. Pre-1.0 used patch-only; post-1.0 use semver normally.
   > ⚠️ The cli no longer lists `@gmc-cli/*` in `dependencies`, so Changesets **won't
   > auto-cascade** a cli bump when an internal package changes. If a change to
   > `api`/`core`/`auth`/`config`/`migrate`/`preflight` should ship, **add `@gmc-cli/cli`
   > to that changeset explicitly** — otherwise the bundled change won't republish.
2. **Merge to `main`.** `release.yml` opens a **`chore: version packages`** PR that
   consumes the changesets and bumps versions + changelogs.
3. **Merge the version PR.** `release.yml` runs again and **stages** `@gmc-cli/cli` to npm
   (via OIDC). It does _not_ go live yet.
4. **Approve the staged package** with your passkey:
   <https://www.npmjs.com/settings/gmc-cli/staged-packages> (or `npm stage list && npm stage approve <id>`).
5. **Cut the GitHub release** for the new tag — this fires the binaries + Homebrew:
   ```sh
   gh release create vX.Y.Z --title "vX.Y.Z — Google Merchant Center CLI" --notes-file notes.md
   ```
   `release-binaries.yml` then builds the 4 standalone binaries, attaches them +
   `checksums.txt`, moves the major Action tag (`v1`, `v2`, …) to the release commit,
   and dispatches `gmc-release-published` to the tap, whose
   `update-gmc-formula.yml` rebuilds `Formula/gmc.rb` from those checksums.

That's it — npm, the standalone binaries, and `brew install yasserstudio/tap/gmc` all land
from one tag.

## Release-notes convention

GitHub release notes are hand-written in this house style (no auto-generated template):

```md
## What's Changed

- **<Area>:** one-line, user-facing description of the change and why.
- **Bug fix:** what was broken and what now works.
- **Routine bumps:** dep1 x.y.z, dep2 a.b.c, …

**Tests:** N. **Commands:** M.

**Full Changelog**: https://github.com/yasserstudio/gmc/compare/vPREV...vNEW
```

Lead with user impact, group by area, bold the category prefix. Keep it to what a user
or integrator would care about — not internal churn.
