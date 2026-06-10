---
"@gmc-cli/cli": patch
---

Add install paths beyond npm: a Homebrew tap (`brew install yasserstudio/gmc/gmc`,
formula in `HomebrewFormula/`) and self-contained standalone binaries (no Node
required) for macOS/Linux, built by a `release: published` workflow and attached to
each GitHub release. New **Installation** guide documents all four paths
(npm · npx · Homebrew · binary). These distribution channels go live with the
npm publish at v1.0 — the formula's tarball `sha256` and the binary build both
activate at first publish.
