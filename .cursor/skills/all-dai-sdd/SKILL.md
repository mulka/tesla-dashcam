---
name: all-dai-sdd
description: Use the pinned Dataspheres AI state-machine workflow to research, specify, execute, validate, and trace work on this dashcam project.
---

# all-dai-sdd project adapter

Use this adapter for feature planning, implementation tracked in Dataspheres AI,
or whenever the user invokes `/all-dai-sdd`.

## Canonical protocol

Run `make setup`, then read these files before changing project state:

- `.cursor/skills/vendor/ari-dai-skills/skills/all-dai-sdd/SKILL.md`
- `.cursor/skills/vendor/ari-dai-skills/skills/all-dai-sdd/PROTOCOL.md`
- [Spec-driven development overview](https://dataspheres.ai/pages/dataspheres-ai/spec-driven-development)

The pinned upstream files are authoritative. This adapter only defines the
Cursor-specific paths and limitations for this repository.

## Cursor commands

Use the project wrapper so commands always target the audited revision:

```bash
scripts/dai-sdd doctor
scripts/dai-sdd init
scripts/dai-sdd loop <arguments>
scripts/dai-sdd conductor <arguments>
```

Cursor does not run the Claude Code hooks installed by upstream
`post-install.sh`. Invoke the `loop.mjs` and `sdd-conductor.mjs` gates explicitly;
never treat a Markdown checklist or an agent's own assertion as proof.

## Required gates

1. Determine the upstream workflow mode before acting (NEW, PUBLISH, AUDIT,
   SYNC, LOOP, or DONE).
2. In NEW/PUBLISH, collect material ambiguities in one batch before creating a
   board. Preserve the user's original request and answers verbatim.
3. Confirm the target datasphere before any remote write.
4. Run the template, chain, evidence, and regression gates required by the
   canonical protocol.
5. After `--request-review`, surface the board and dashboard links and stop.
   Only run `--greenlight` after explicit human approval.
6. Never substitute stubs, mocks, or synthetic test results for executed
   evidence. Synthetic parser fixtures are unit-test evidence only, not
   end-to-end Tesla footage validation.

Keep API keys in Cursor Secrets or `~/.dataspheres.env`. Never put a key in
tracked files, task content, logs, or chat.
