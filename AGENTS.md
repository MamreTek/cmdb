# CMDB project instructions

Use the current MamreTek central `mamre-workspace/standards/README.md` when available. Otherwise read `docs/development-conventions.md` (portable conventions 1.2). Resolve the external requirement and GitHub workflow record by the normalized `MamreTek/cmdb` origin identity, including from linked worktrees.

Use React, strict TypeScript, Ant Design and a single npm lockfile. All business requests go through the typed API client. This is a Mock-only product prototype; do not connect production data or claim real authorization, persistence or audit guarantees. New permission controls are deferred; preserve any existing security contracts.

Requirements stay outside the source repository. Implement on `issue/<number>`, run `npm run check` and the applicable browser checks, then open a PR against protected `main`. Do not merge or deploy without authorization. Provider-facing text is English; the product defaults to Chinese. Preserve unrelated changes and never publish credentials, private source, machine-local workflow records or local requirement paths.
