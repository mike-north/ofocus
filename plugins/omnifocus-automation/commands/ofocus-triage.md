---
description: Triage the OmniFocus inbox and co-plan — propose dispositions for approval, then apply.
---

Triage my OmniFocus inbox with me.

Follow the **`ofocus-triage`** skill:

1. Read the inbox (`ofocus tasks --in-inbox --format toon`) and, where useful, the decision-ready context (`ofocus today`, `ofocus stalled-projects`, `ofocus next-actions`).
2. For each inbox item, propose a disposition — a project, tags, defer/due dates, flag, or drop/delete.
3. Present **all proposals as one batch** for me to approve or amend.
4. Only after I confirm, apply via `ofocus update` / `update-batch` (or `complete` / `drop` / `delete`).

Never mutate OmniFocus without my explicit confirmation.
