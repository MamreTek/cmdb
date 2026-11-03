# Portable CMDB conventions

MamreTek conventions snapshot: **1.2 · 2026-11-03**. Read the current central standards when available; this file is the portable fallback for this project's applicable rules.

- Build the prototype with React + strict TypeScript + Ant Design, Vite, React Router and npm. Keep a single lockfile and pinned compatible dependencies.
- Keep app layout/routes in `src/app`, business pages in `src/features`, and contracts/client/Mock handlers in `src/shared/api`.
- Use fictional Mock data for absent backends. Define stable versioned REST contracts, IDs, validation, pagination, sorting, errors and examples. Business components must use one API client; backend adaptation belongs in the transport layer.
- Show loading, empty, failure/retry and submission states. Validate forms, retain failed input and confirm operations with effects. Support narrow screens and keyboard use.
- This phase defers new menu, button and API authorization controls. Preserve existing authentication, authorization and security. Mark the UI as a prototype with simulated data and no authorization protection. No production data or production deployment.
- Future real services must validate inputs, resource ownership, permissions and state transitions server-side, use controlled credentials and implement appropriate session protections. Mock success is not security acceptance.
- Use UTC ISO timestamps. Keep Mock data separate from production initialization. Do not introduce databases or infrastructure merely to demonstrate a frontend.
- Run formatting, lint, strict type checks, meaningful behavior tests and a build; CI repeats core checks. State skipped checks and limits. Mock acceptance does not establish real business, security or persistence acceptance.
- Resolve project bindings from the normalized origin, keep requirements external, use an issue branch and PR, preserve unrelated work. Provider-facing prose is English. Do not merge, publish or change production without authorization.
- Never commit credentials, private data, nested repositories, dependency directories, build output or machine-local Codex state.
