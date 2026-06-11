---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

`gmc doctor` now correctly diagnoses the **"Cloud project not registered as an API
client"** trap. The Merchant API returns this as a 401/403 with a distinctive message;
previously `doctor` reduced it to a generic "401 Unauthorized → re-authenticate" (the
wrong fix — the token is valid). It now detects the case, surfaces the real API message
(including the specific project id/number), and points to the right fix: register the
Cloud project under Merchant Center → Settings → Connected accounts / Developers. The
401/403 diagnoses also surface the underlying API message generally.
