---
"@ofocus/sdk": patch
"ofocus": patch
---

Accept task IDs that contain a dot (e.g. `ab7XE6LYJBv.0`)

OmniFocus gives repeating tasks per-occurrence "instance" IDs that include a dot,
such as `ab7XE6LYJBv.0`. These IDs were shown in listing output but mutation
commands (`delete`, `update`, `focus`, URL generation, etc.) rejected them with
`INVALID_ID_FORMAT`, leaving those tasks impossible to act on from the CLI. ID
validation now accepts dots, so any ID that appears in output can also be used as
input. Path and shell metacharacters remain rejected.
