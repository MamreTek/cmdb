# Prototype verification

Verified on 2026-11-03 using Node 24.14.0, npm 11.9.0 and the pinned dependency lockfile.

| Check                  | Result                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `npm ci`               | Initial locked install passed; dependencies and lockfile unchanged in this iteration                |
| `npm run format:check` | Passed                                                                                              |
| `npm run lint`         | Passed, no warnings                                                                                 |
| `npm run typecheck`    | Passed, strict TypeScript                                                                           |
| `npm test`             | 55 tests passed: contracts, replayable examples, CI Class inheritance, typed fields and UI behavior |
| `npm run build`        | Passed; static build only, no deployment                                                            |
| `npm run test:e2e`     | 6 Chromium workflows passed                                                                         |

The browser workflows cover:

1. CI creation, model attributes, editing ownership, adding/removing a directed relationship, retirement and change history.
2. Empty search, simulated service failure/retry, CSV preview/import and refresh resetting in-memory data.
3. Desktop overview, mobile navigation and model pages at a 390px viewport without page overflow.
4. Required custom-field preview/backfill, mapped CSV upsert with before/after differences, identity and unmapped-attribute preservation, attribute filtering, saving/applying a session view and viewing service dependencies.
5. Custom-model creation and model-relationship rule editing at 390px without page overflow.

Contract tests also cover duplicate identities, invalid fields, stale revisions, invalid relationships, retired endpoints, atomic CSV rejection, quoted/CRLF CSV, import revalidation, complete pagination after 200 imported records, timeouts and the HTTP adapter. JSON examples in `api-examples.json` are replayed against fresh Mock handlers.

Configuration tests cover six typed fields, required/unique/default validation, schema impact checks and atomic default backfill, schema/CI revisions, stale import tokens and changed payloads, mapped updates and no-op repeat upserts, model relationship pairs/cardinality, saved filters and bounded/cyclic dependency paths. References to a later-retired CI can be retained; new references to a target retired by the same batch are rejected without partial writes. The UI test exercises text/number/boolean/date/enum/reference controls and preserves zero/false values.

During browser verification, relationship selectors could be operated before their model rules loaded. The form now waits for the rules; the original create/edit/relate/retire workflow passes. Ant Design's retained dropdown animations also required the new tests to target each control's associated popup; no interaction checks were bypassed.

Local browser screenshots are generated at `artifacts/overview-desktop.png` and `artifacts/models-mobile.png`. Artifacts and traces are ignored by Git; CI uploads browser failure traces only. The browser test server is bound to loopback and is shut down after testing.

Additional local screenshots: schema-preview-desktop.png, mapped-import-desktop.png, service-tree-desktop.png and model-rules-mobile.png. Desktop forms/import/tree and mobile model/rule layouts were visually inspected. The retained private preview was checked separately on loopback and the existing private LAN interface: HTTP 200, configurable-model UI, CI creation, CSV preview/submission, refresh reset, no page errors and no external-origin requests. Another physical LAN device was not available for a reachability check. The local helper, machine addresses and runtime artifacts are not published.

## Limits

All application data is fictional and in memory. No real backend, persistence, authentication, authorization, resource isolation, immutable audit, real discovery or cross-product integration was exercised. No production data was used. This is product-flow and Mock-contract acceptance, not production/security acceptance or an accessibility certification.

The build retains a size warning for a shared UI/runtime chunk of approximately 642 kB minified (209 kB gzip). Routes are loaded lazily; no network performance target or bundle-size acceptance claim is made. The service tree is limited to three levels and 200 displayed nodes, and schema edits are append-only. CSV provenance records the latest CSV write, not field-level lineage.

Initial repository setup created only a README on `main`. Feature work belongs to `issue/1` and must be delivered via PR; merging and production deployment are outside this change.

## CI Class and database-field iteration

The sixth browser workflow creates a host subclass, verifies inherited field origins, previews ancestor-field impact across the subtree, exercises varchar rejection/input preservation and timezone timestamp normalization, selects a subclass while creating a CI, toggles descendant inclusion, and previews a blocked length migration without applying it. Desktop and 390px class-tree layouts are checked. Local screenshots: class-inheritance-desktop.png, class-tree-mobile.png and type-migration-preview.png.

Eight additional contract tests verify declaration-subtree uniqueness, field collisions, atomic ancestor backfill and descendant revisions, Unicode code-point lengths, signed 32-bit integer and timestamp boundaries, inherited CSV validation, no-side-effect migration previews, subclass references, exact relationship rules and hierarchy depth limits. Existing identities, imports, relationships and saved-view workflows are retained.

The ambiguous `long` type remains pending explicit user clarification between a 64-bit integer and long text. No alias or destructive schema migration is enabled. Varchar/integer/timestamp are Mock-validated logical types; no real database DDL, storage constraints or migration has been exercised. See ci-classes.md for explicit semantics and primary references.
