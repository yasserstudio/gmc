---
"@gmc-cli/cli": patch
---

feat(action): preflight gate with inline PR annotations, job summary, and structured outputs

The GitHub Action (`uses: yasserstudio/gmc@v1`) now runs preflight with:

- Inline error/warning annotations on PR diffs, pinned to the source feed file
- A job-summary table of all findings in the Actions run summary tab
- Structured outputs (`ok`, `scanned`, `errors`, `warnings`, `report`) for downstream steps

Non-preflight commands continue to pass through directly.
