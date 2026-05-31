---
"@ofocus/productivity": patch
---

Fix an EPIPE crash in `ofocus changes --semantic`. Writing the diff packet to a
summary command that doesn't read stdin (or exits immediately, e.g. a misconfigured
`OFOCUS_SUMMARY_CMD`) no longer surfaces as an unhandled exception — the broken-pipe
error is swallowed, consistent with the command's fail-open contract.
