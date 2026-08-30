---
"@gmc-cli/cli": minor
"@gmc-cli/api": minor
"@gmc-cli/auth": patch
"@gmc-cli/preflight": minor
"@gmc-cli/migrate": minor
"@gmc-cli/mcp": patch
---

Align GMC with Google's August 2026 Merchant API surface: add Loyalty Customers GA,
product patching and current 2026 attributes, base64url-safe product identifiers, the current
nested inventory wire format, account filters/sub-account and test-account support, account
limits, data-source compatibility, plural-GTIN migration, and video-link preflight checks.

Also harden the GitHub Action summary against feed-controlled Markdown injection, run its
standalone tests in the main test command, pin CI actions, and update dependencies to patched
releases.
