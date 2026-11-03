# Prototype verification

Verified on 2026-11-03 using Node 24.14.0, npm 11.9.0 and the pinned dependency lockfile.

| Check                  | Result                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm ci`               | Passed; clean lockfile install, audit reported 0 known vulnerabilities |
| `npm run format:check` | Passed                                                                 |
| `npm run lint`         | Passed, no warnings                                                    |
| `npm run typecheck`    | Passed, strict TypeScript                                              |
| `npm test`             | 33 tests passed: contracts, replayable examples and UI behavior        |
| `npm run build`        | Passed; static build only, no deployment                               |
| `npm run test:e2e`     | 3 Chromium workflows passed                                            |

The browser workflows cover:

1. CI creation, model attributes, editing ownership, adding/removing a directed relationship, retirement and change history.
2. Empty search, simulated service failure/retry, CSV preview/import and refresh resetting in-memory data.
3. Desktop overview, mobile navigation and model pages at a 390px viewport without page overflow.

Contract tests also cover duplicate identities, invalid fields, stale revisions, invalid relationships, retired endpoints, atomic CSV rejection, quoted/CRLF CSV, import revalidation, complete pagination after 200 imported records, timeouts and the HTTP adapter. JSON examples in `api-examples.json` are replayed against fresh Mock handlers.

Local browser screenshots are generated at `artifacts/overview-desktop.png` and `artifacts/models-mobile.png`. Artifacts and traces are ignored by Git; CI uploads browser failure traces only. The browser test server is bound to loopback and is shut down after testing.

## Limits

All application data is fictional and in memory. No real backend, persistence, authentication, authorization, resource isolation, immutable audit, real discovery or cross-product integration was exercised. No production data was used. This is product-flow and Mock-contract acceptance, not production/security acceptance or an accessibility certification.

The build retains a size warning for a shared UI/runtime chunk of approximately 595 kB minified (193 kB gzip). Routes are loaded lazily; no network performance target or bundle-size acceptance claim is made.

Initial repository setup created only a README on `main`. Feature work belongs to `issue/1` and must be delivered via PR; merging and production deployment are outside this change.
