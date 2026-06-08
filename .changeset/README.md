# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It
drives versioning and the public changelog for the `@gmc-cli/*` packages.

Workflow (mirrors GPC):

```sh
pnpm changeset          # describe a user-facing change: pick packages + bump + write the line
pnpm version-packages   # apply pending changesets → bump versions + update CHANGELOGs
pnpm release            # publish (CI does this via OIDC; see release-strategy)
```

Conventions:

- One changeset per user-facing change, written in changelog language (the line ships verbatim).
- `@gmc-cli/cli` (the `gmc` command) is the version users track; supporting packages
  version independently.
- `0.x` pre-release through the spike and build-out; `1.0.0` at public launch.
