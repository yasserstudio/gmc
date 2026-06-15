# Security Policy

## Supported Versions

GMC ships small, frequent patch releases, and only the **latest published version** receives security updates — there are no long-term-support branches. Upgrade to the newest release to stay covered.

| Version                                         | Supported          |
| ----------------------------------------------- | ------------------ |
| Latest `@gmc-cli/cli` release (current `1.0.x`) | :white_check_mark: |
| Any earlier release                             | :x:                |

Check your version with `gmc --version` and update with `npm install -g @gmc-cli/cli@latest`.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Report privately through either channel:

- **GitHub Security Advisories** — [Report a vulnerability](https://github.com/yasserstudio/gmc/security/advisories/new) (preferred; keeps the report private until a fix ships).
- **Email** — [hello@yasser.studio](mailto:hello@yasser.studio) with `GMC SECURITY` in the subject line.

Please include:

- the GMC version (`gmc --version`) and how it was installed (npm / Homebrew / standalone binary),
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any relevant logs — with credentials, tokens, and account IDs redacted.

### What to expect

- **Acknowledgement** within 3 business days.
- An initial severity assessment within 7 business days.
- A fix released as a patch version as soon as practical, with progress updates along the way.
- Credit in the advisory / release notes if you'd like it — just tell us how you'd like to be named.

### Scope

GMC handles Google credentials — OAuth tokens, service-account keys, and Application Default Credentials. Reports we especially want:

- credential or token leakage (in logs, error output, `--json`, or the on-disk config),
- insecure storage or transmission of credentials,
- command/argument injection or path traversal (e.g. via feed files or data-source paths),
- flaws in how GMC resolves or trusts configuration, profiles, or feed data.

Out of scope: vulnerabilities in Google's Merchant API itself (report those to Google), and issues that require an already-compromised local machine.

Thank you for helping keep GMC and its users safe.
