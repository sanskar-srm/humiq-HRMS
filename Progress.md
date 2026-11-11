# HRMS Progress

Last updated: 2026-11-08

## Current status

- Backend, frontend and database schema are implemented for the core HRMS modules.
- Automated API tests pass (`7/7`).
- Frontend production build passes (one bundle-size warning).
- **Live Supabase is connected and seeded.** `npm run db:verify` succeeds, `npm run db:push` reports the schema in sync, and `npm run seed` created the demo dataset (61 tables, all modules populated). The API reads and writes real Supabase data; no module uses static KPI data.

## Demo identities

The four demo accounts are intentionally seeded. Names and login emails were updated; passwords are unchanged for existing rows.

| Employee ID | Name | Role | Email |
| --- | --- | --- | --- |
| EMP001 | Sanskar | Admin / CEO | sanskar@hrms.local |
| EMP002 | Himanshu | HR | himanshu@hrms.local |
| EMP004 | Tejas | Manager | tejas@hrms.local |
| EMP005 | Emp_1 | Employee | emp1@hrms.local |

`npm run seed` calls `syncDemoAccounts`, which renames these four rows in place without deleting live data or changing existing passwords.

## Branding

- Logo and favicon use `client/public/hrms_logo.png` (copied from the supplied asset). Vite serves it at `/hrms_logo.png` and copies it to `dist` on build.
- The logo is referenced in `client/index.html` (favicon + apple-touch-icon), the sidebar header and both auth-layout brand blocks.

## Modules

| Module | Backend | Frontend | Database | Status |
| --- | --- | --- | --- | --- |
| Authentication and employees | `server/src/modules/auth`, `employees` | `client/src/pages/auth`, `employees` | `employees`, `audit_logs` | Complete |
| Dashboard | `server/src/modules/dashboard` | `client/src/pages/dashboard` | Live aggregate queries | Complete |
| Workforce Planning | `server/src/modules/workforce` | `client/src/pages/workforce` | `workforce_*`, `employee_skills`, `succession_plans` | Complete |
| Offboarding | `server/src/modules/offboarding` | `client/src/pages/offboarding` | `offboarding_*`, `exit_documents` | Complete |
| Attendance | `server/src/modules/attendance` | `client/src/pages/attendance` | `attendance_records`, `leave_requests`, `shifts`, `holidays` | Complete |
| Compensation | `server/src/modules/compensation` | `client/src/pages/compensation` | `salary_grades`, `employee_compensation`, benefits, rewards, reimbursements | Complete |
| Payroll | `server/src/modules/payroll` | `client/src/pages/payroll` | `payroll_runs`, `payslips`, `tax_records` | Complete |
| Onboarding | `server/src/modules/onboarding` | `client/src/pages/onboarding` | `onboarding_*` | Complete |
| Recruitment | `server/src/modules/recruitment` | `client/src/pages/recruitment`, `pages/public/OfferResponse` | requisitions, approvals, openings, candidates, interviews, offers | Complete |
| Performance | `server/src/modules/performance` | `client/src/pages/performance` | cycles, goals, reviews, feedback, skills | Complete |
| Helpdesk | `server/src/modules/helpdesk` | `client/src/pages/helpdesk` | tickets, comments, KB, documents, CSAT | Complete |
| Engagement | `server/src/modules/engagement` | `client/src/pages/engagement` | `engagement_*` | Present |
| Employee Relations | `server/src/modules/relations` | `client/src/pages/relations` | `er_cases` | Present |
| LMS | `server/src/modules/lms` | `client/src/pages/lms` | `lms_*` | Present |

The three modules in the last group are present in the current repository and are not part of the original nine-module scope.

## Hardcoded values and KPI audit

- All dashboard and module KPI cards are driven by API responses. No static KPI datasets remain.
- The only hardcoded progress value was `ProgressBar value={60}` on the employees list; it now uses an indeterminate loading bar.
- Demo login passwords and the employee demo email are now configurable through `VITE_DEMO_PASSWORD`, `VITE_DEMO_EMPLOYEE_EMAIL` (client) and `SEED_PASSWORD` (server).
- Seed ticket numbers, fiscal-year labels and review-cycle labels are generated from the current year instead of fixed 2026 strings.
- Status, role, department and category lists remain domain constants; they are not fake KPI data.

## Error handling and logs

- `server/src/utils/logger.js` provides timestamped, level-filtered structured logs.
- `server/src/middleware/requestLogger.js` assigns `X-Request-Id` and logs method, path, status, duration, user and IP for every request.
- `server/src/middleware/errorHandler.js` logs every rejected/failed request, maps validation, CORS, JWT, Prisma and database errors, and returns a request ID.
- Startup verifies the database connection, logs failures and exposes `/health` as `503` when the database is unavailable.
- `unhandledRejection` and `uncaughtException` are logged.
- The frontend API interceptor logs every failed request with status, code, request ID and details; global `error` and `unhandledrejection` handlers are installed in `client/src/main.jsx`.

## Database

- Prisma schema: `server/prisma/schema.prisma` (validated and applied to Supabase).
- SQL reference schema: `server/migrations/001_init.sql`.
- Runtime adapter: node-`pg` against Supabase Postgres (`server/src/db/prisma.js`), with local JSON memory adapter for development and tests.
- API payloads are normalised so both adapters return identical shapes: `DATE` columns as `YYYY-MM-DD`, `NUMERIC` columns as numbers.
- `DB_MODE=memory` is supported for local development; production rejects it.
- Apply schema: `cd server && npm run db:push`.
- Seed and sync demo identities: `cd server && npm run seed`.

## Verification

| Check | Result |
| --- | --- |
| `cd server && npm run db:verify` | Connected as `postgres` on database `postgres` |
| `cd server && npm run db:push` | Database already in sync with Prisma schema |
| `cd server && npm run seed` | Seeded 61 tables; demo identities synced |
| Live login `EMP001` | Sanskar / Admin / sanskar@hrms.local |
| Live login `EMP002` | Himanshu / HR / himanshu@hrms.local |
| Live login `EMP004` | Tejas / Manager / tejas@hrms.local |
| Live login `EMP005` | Emp_1 / Employee / emp1@hrms.local |
| Live employee portal login | Emp_1 / Employee / emp1@hrms.local |
| Live dashboard | 10 active employees, 2 pending leaves, 2 open tickets, 2 requisitions awaiting approval, payroll 2026-10 Disbursed |
| Live module reads | Attendance, compensation, payroll, helpdesk and employees return real Supabase rows |
| `cd server && npm test` | 7 passed, 0 failed |
| `cd client && npm run build` | Passed (bundle-size warning only) |

## Known issues and remaining work

1. The frontend bundle is about 980 kB minified; add route-level code splitting if bundle size matters.
2. The repository is not a Git repository; no commits have been made.
3. The seeded dataset is demo data. Replace or extend it through the app before using this as a production system.
