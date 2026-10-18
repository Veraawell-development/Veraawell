# Baseline before the sessions overhaul (2026-10-18)

The starting point every later PR is compared against ("no regression vs baseline").

| Item | Value |
|------|-------|
| `origin/main` | `942296d` — Merge PR #9 (auth live-test fixes) |
| Server tests (`npm run test:coverage`) | 51 suites, 1022 tests, all passing |
| Server coverage | 84.49% statements, 73.69% branches (floor in `server/__tests__/support/COVERAGE_FLOOR.json`) |
| Server timezone run (`npm run test:tz`) | 1022 passing (one historical flake in `authz.matrix` V2c/V4d, passed on rerun) |
| Client unit (`npx vitest run`) | 9 files, 116 tests, all passing |
| Client build | `tsc` clean, `vite build` clean |
| Playwright `auth-tests` | 38 / 38 |
| Playwright `public`, `admin`, `patient`, `doctor` | 146 passing; 6 known stale failures (below) |
| Production | `https://veraawell.com`, `https://api.veraawell.com` on `942296d`; CI green on `main` |

Known stale Playwright failures (fixed in Phases 5 and 6 of the plan):

- `patient.spec.ts` — the screening tiles line up (1440 px)
- `patient.spec.ts` — the screening tiles line up (1024 px)
- `patient.spec.ts` — missing images: a deleted asset answers 200 with HTML instead of 404ing
- `patient.spec.ts` — missing images: the landing page renders broken images
- `patient.spec.ts` — missing images: the About page renders a broken portrait
- `doctor.spec.ts` — the payout split is shown net of the platform fee

Companion diagrams in this folder:

- `sessions-plan.excalidraw` / `.png` — the plan: session timeline, every scenario, phases, LiveKit design, bug list.
- `patient-side-tree.excalidraw` / `.png` — every patient-side feature; nodes turn green as they are verified live.
