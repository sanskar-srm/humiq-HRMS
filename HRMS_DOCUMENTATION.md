# HRMS — Human Resource Management System
## Application Documentation

A unified Human Resource Management System designed to manage the employee lifecycle and day-to-day HR operations through a single web application. The system is organized into twelve functional modules and uses a shared employee master record across the application.

This document describes the proposed application architecture, authentication and authorization model, portal capabilities, module functionality, API conventions, and end-to-end workflows for an HRMS built with React.js, Vite, Tailwind CSS, Node.js, and Express.js.

> **Implementation note:** This document is the technology-adapted specification for the HRMS project. It preserves the functional scope and business rules of the source documentation, but does not assert that the proposed React frontend, Express routes, database migrations, or integrations have already been implemented or deployed. Confirm actual route names, environment variables, and deployment details against the project code before treating them as live configuration.

- **Frontend:** React.js · Vite · Tailwind CSS
- **Backend:** Node.js · Express.js
- **Database:** PostgreSQL (Supabase)
- **Authentication:** JWT
- **Authorization:** Role-Based Access Control (RBAC)
- **Communication:** REST APIs over HTTP/HTTPS
- **Modules:** Workforce Planning · Offboarding · Engagement · Employee Relations · Attendance · Compensation · Payroll · Onboarding · Learning (LMS) · Recruitment · Performance · Helpdesk

---

## 1. Architecture at a glance

The application follows a client-server architecture. The React application provides the user interface, the Express API handles business logic and access control, and Supabase PostgreSQL stores shared application data.

```text
                 ┌──────────────────────────────────────────────┐
                 │              User's Browser                   │
                 │       React.js + Vite + Tailwind CSS          │
                 │  Admin/HR Portal · Manager Portal · Employee  │
                 └──────────────────────┬───────────────────────┘
                                        │ HTTPS / REST API
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │             Node.js + Express.js              │
                 │                                              │
                 │  Authentication · JWT · RBAC · Validation    │
                 │  API Routes · Controllers · Services         │
                 │  12 HR Modules · Error Handling               │
                 └──────────────────────┬───────────────────────┘
                                        │ Database queries
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │             Supabase PostgreSQL               │
                 │                                              │
                 │  Shared public schema                         │
                 │  employees = shared employee master           │
                 │  HR module tables · relationships · indexes   │
                 └──────────────────────────────────────────────┘
```

### 1.1 Frontend layer

The frontend is a React single-page application (SPA), built and served using Vite.

Responsibilities:

- Render the Admin/HR, Manager, and Employee portals.
- Provide dashboards, forms, tables, charts, navigation, and module-specific pages.
- Handle client-side routing and protected routes.
- Maintain authentication state and attach access tokens to API requests.
- Display loading, validation, success, and error states.
- Adapt layouts for desktop, tablet, and mobile screens.
- Use reusable React components and shared Tailwind CSS design utilities.

### 1.2 Backend layer

The backend is a Node.js application using Express.js.

Responsibilities:

- Expose REST API endpoints for the frontend.
- Authenticate users and issue/verify JWTs.
- Enforce role and permission checks on protected endpoints.
- Validate and sanitize incoming request data.
- Execute module-specific business logic.
- Scope database queries to the current employee or manager's team where required.
- Handle database operations and return consistent JSON responses.
- Centralize error handling, logging, and API response formatting.

### 1.3 Database layer

Supabase PostgreSQL acts as the shared database for the application.

- All HR modules use the same database.
- `employees` is the shared employee master record and the source of truth for employee identity and organizational details.
- Module-specific tables store operational data such as attendance, payroll, recruitment, performance, and helpdesk tickets.
- Foreign keys and relationships should connect module records to the relevant employee records.
- Database migrations should be version-controlled and applied consistently across environments.

### 1.4 Suggested project structure

The following is a recommended organization for the React and Express implementation. It is a reference structure, not a claim about the current repository.

```text
hrms/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   ├── layout/
│   │   │   └── ui/
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── workforce/
│   │   │   ├── offboarding/
│   │   │   ├── engagement/
│   │   │   ├── relations/
│   │   │   ├── attendance/
│   │   │   ├── compensation/
│   │   │   ├── payroll/
│   │   │   ├── onboarding/
│   │   │   ├── lms/
│   │   │   ├── recruitment/
│   │   │   ├── performance/
│   │   │   └── helpdesk/
│   │   ├── routes/
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── authorize.js
│   │   │   └── errorHandler.js
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── employees/
│   │   │   ├── workforce/
│   │   │   ├── offboarding/
│   │   │   ├── engagement/
│   │   │   ├── relations/
│   │   │   ├── attendance/
│   │   │   ├── compensation/
│   │   │   ├── payroll/
│   │   │   ├── onboarding/
│   │   │   ├── lms/
│   │   │   ├── recruitment/
│   │   │   ├── performance/
│   │   │   └── helpdesk/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── migrations/
│   ├── package.json
│   └── .env.example
│
├── README.md
└── DOCUMENTATION.md
```

A module can be organized internally into routes, controllers, services, validators, and data-access functions. This keeps HTTP handling separate from business rules and database operations.

---

## 2. Authentication and login flows

The system has two user-facing login experiences:

1. **Staff login:** Used by Admin, HR, and Manager accounts, and by employee accounts that are enabled for the staff application.
2. **Employee self-service login:** Used by employees to access their self-service portal.

The two experiences have different entry points and portal permissions. If separate session types are retained, they must remain isolated and must not be treated as interchangeable credentials.

### 2.1 Staff login flow

**Suggested route:** `/login`  
**Suggested API:** `POST /api/v1/auth/login`

Request body:

```json
{
  "employee_id": "EMP001",
  "password": "user-password"
}
```

Flow:

```text
User opens /login
       │
       ▼
Enters employee ID and password
       │
       ▼
POST /api/v1/auth/login
       │
       ▼
Backend validates credentials
against the employee record
       │
       ▼
Backend determines the user's role
       │
       ▼
JWT access token is issued
       │
       ▼
Frontend stores/manages the session
       │
       ▼
Redirect to the HRMS module dashboard
       │
       ▼
User opens a permitted module
```

The backend should:

- Find the employee using the supplied employee identifier.
- Compare the submitted password with the stored password hash using a secure password-hashing library.
- Derive or load the user's authorized role.
- Issue a signed JWT containing the minimum required identity and authorization claims.
- Return the token and the user profile/role information.
- Never return the stored password hash to the client.

The frontend should:

- Maintain authentication state through a shared authentication context or equivalent state-management layer.
- Send the access token with protected API requests, normally through an `Authorization: Bearer <token>` header.
- Redirect unauthenticated users to the login page.
- Handle expired or invalid sessions.
- Use protected routes for user experience, while relying on backend authorization for actual security.

**Security recommendation:** Prefer secure, HTTP-only cookies for browser sessions where the deployment architecture supports them. If tokens are stored in browser storage, apply appropriate XSS protections, short token lifetimes, and refresh/revocation controls. The final storage strategy must be selected and implemented consistently.

### 2.2 Employee self-service login flow

**Suggested route:** `/employee/login`  
**Suggested API:** `POST /api/v1/employee/auth/login`

Request body:

```json
{
  "email": "employee@example.com",
  "password": "user-password"
}
```

Flow:

```text
Employee opens /employee/login
          │
          ▼
Enters email and password
          │
          ▼
POST /api/v1/employee/auth/login
          │
          ▼
Backend validates email and password
          │
          ▼
Employee profile and session are returned
          │
          ▼
Frontend opens the employee self-service portal
```

New employee registration may be provided at `/employee/register`, subject to the organization's registration policy. A registration process may collect email, phone number, department, and password, then create an employee record with a unique employee code and securely stored password hash.

Registration must validate that the person is authorized to join the organization. Public registration should not allow arbitrary users to create trusted employee accounts.

The employee self-service portal should expose only employee-facing functions. It must not grant access to HR-only administration features merely because a user has successfully logged in.

### 2.3 Session and API protection

Recommended request lifecycle:

1. The frontend sends a request to a protected API.
2. Express authentication middleware validates the JWT or session.
3. The middleware identifies the current employee.
4. Authorization middleware checks the required role or permission.
5. The controller calls the relevant service.
6. The service queries only records the caller is allowed to access.
7. The API returns a JSON response.

Example:

```text
React page
   │
   ▼
API service / Axios or Fetch
   │  Authorization: Bearer token
   ▼
Express route
   │
   ├── authenticate middleware
   │
   ├── authorize middleware
   │
   ▼
Controller → Service → Database
   │
   ▼
JSON response → React UI
```

### 2.4 Demo and test accounts

The source specification describes four seeded accounts. Their example identities and role expectations can be retained for a development environment, but passwords must be reset to secure, environment-specific values before use.

| Account | Example identifier | Expected role |
|---|---|---|
| Executive / CEO | `emp_ceo` | Admin |
| HR representative | `emp_001` | HR |
| Manager with direct reports | `emp_003` | Manager |
| Employee without direct reports | `emp_004` | Employee |

Do not deploy predictable demo passwords or one-click demo login controls in production. Seed data should be restricted to development or testing environments.

---

## 3. Roles and Role-Based Access Control (RBAC)

RBAC determines which parts of the HRMS a user can access and which operations they can perform.

The four primary roles are:

| Role | Responsibility |
|---|---|
| **Admin** | Organization-wide administration and system oversight |
| **HR** | Human resource operations and employee management |
| **Manager** | Team-level operations and approvals |
| **Employee** | Personal information and self-service activities |

### 3.1 Role assignment

The original business rules derive roles from employee organizational information:

| Role | Assignment rule |
|---|---|
| **Admin** | Employee level is CEO, President, or AVP, or department is Executive |
| **HR** | Employee department is HR |
| **Manager** | Employee has direct reports, meaning another employee's `reports_to` field references them |
| **Employee** | All other employees |

These rules should be implemented in a centralized backend authorization service. If roles are stored explicitly, changes to employee reporting relationships and role assignments must be handled consistently. A client must never be allowed to assign itself a higher role.

### 3.2 Module access matrix

The following matrix preserves the access scope described in the source documentation. A check mark means the role may enter the module, not that it can access every page or every record within it.

| Module | Admin | HR | Manager | Employee |
|---|:---:|:---:|:---:|:---:|
| Workforce Planning | ✅ | ✅ | ✅ | ❌ |
| Offboarding | ✅ | ✅ | Own/team-scoped page | Own page |
| Engagement | Admin console | Admin console | Self-service | Self-service |
| Employee Relations | ✅ | ✅ | Case console | Own concerns |
| Onboarding | Full | Full | Induction, training, progress | Own onboarding |
| Attendance | ✅ | ✅ | Own + team | Own |
| Compensation | Full | Full | Reimbursement review | Self-service |
| Payroll | Full | Full | Limited team functions | Own payslips/taxes/reimbursement |
| Learning (LMS) | Full | Full | Team dashboard | Own dashboard |
| Recruitment | ✅ | ✅ | Department-scoped | ❌ |
| Performance | Company view | Company view | Team view | Self view |
| Helpdesk | Agent console | Agent console | Agent console | Employee portal |

### 3.3 Two layers of access enforcement

Access control must be enforced at both the frontend and backend.

**1. Frontend route and page protection**

- Hide or restrict navigation items where appropriate.
- Prevent unauthorized users from opening protected pages.
- Redirect users to an allowed landing page.
- Display only the controls relevant to the user's role.

Frontend protection improves usability. It is not a security boundary because browser code can be inspected or bypassed.

**2. Backend authorization and data scoping**

- Require a valid authenticated session on protected endpoints.
- Check role and permission requirements for each operation.
- Scope database queries to the current employee or their authorized team.
- Reject unauthorized create, update, delete, approval, and administrative operations.
- Avoid returning organization-wide data to lower-privilege users.

For example, an administrator may view all payslips, while an employee may retrieve only their own payslips. A manager may view only the records within their permitted team scope.

> **Important:** Never rely only on React route guards to protect payroll, employee, or other confidential information. Every protected API endpoint must enforce authorization and data-level access rules on the server.

### 3.4 Page-level permissions

Module-level access is not sufficient for complex HR modules. Each module should define page-level permissions and operation-level permissions.

Examples:

- A manager may enter Payroll but must not access salary disbursement or payroll audit functions.
- An employee may enter Performance but may view only their own goals and reviews.
- A manager may review team reimbursements but must not change organization-wide benefit configuration.
- An employee may access Helpdesk tickets and published knowledge-base articles but not agent workload or SLA administration.

---

## 4. Application portals

### 4.1 Admin / HR Portal

**Entry:** `/login` → HRMS dashboard → permitted module.

The Admin/HR portal is the primary management interface for organization-wide HR operations.

Capabilities include:

- View organization-level dashboards and workforce information.
- Manage employee records and organizational data.
- Create and manage onboarding activities.
- Configure engagement surveys and recognition programs.
- Handle employee relations cases.
- Monitor attendance, leave, and shifts.
- Manage compensation and benefits.
- Process payroll and related compliance activities.
- Manage recruitment and hiring requisitions.
- Manage learning programs and performance reviews.
- Operate the helpdesk and review reports.

The dashboard should provide navigation to all twelve modules. The data and actions available within each module must follow the signed-in user's permissions.

### 4.2 Manager Portal

**Entry:** `/login` → Manager dashboard.

The Manager portal provides a team-oriented view of HR operations. Managers should see their own information and permitted team information, not unrestricted organization-wide employee data.

| Module | Manager capabilities |
|---|---|
| Onboarding | View induction schedules, assign/track training where permitted, and monitor onboarding progress |
| Attendance | View own and team attendance, shifts, leave, and relevant requests |
| Compensation | Review team reimbursements and permitted rewards/salary information |
| Payroll | Use permitted dashboard, salary-processing, attendance-integration, reimbursement, and team-payslip functions |
| Workforce | View permitted planning information such as capacity, bench, forecasting, and succession |
| Recruitment | Raise requisitions and participate in department-scoped hiring activities |
| Learning (LMS) | Assign and track team learning |
| Performance | Manage team goals, reviews, progress, and feedback |
| Employee Relations | Access the permitted employee-relations case console |
| Helpdesk | Use the agent console where authorized |

Managers do not receive the Engagement administration console. They use the employee-style Engagement self-service pages. HR/admin-only pages within other modules remain restricted.

### 4.3 Employee Portal

**Entry:** `/employee/login` → Employee self-service dashboard.

The Employee portal allows staff to access their own HR information and complete self-service activities.

| Page | Suggested route | Purpose |
|---|---|---|
| My Surveys | `/engagement/my-surveys` | Complete surveys assigned to the employee |
| My Feedback | `/engagement/my-feedback` | Submit and track feedback |
| My Wellness | `/engagement/my-wellness` | Complete personal wellness check-ins |
| Recognition | `/engagement/my-recognition` | View points, badges, rewards, and leaderboard information |
| Pulse Check | `/engagement/my-pulse` | Respond to team pulse polls, if enabled |
| Wellness Dashboard | `/engagement/wellness-dashboard` | View personal wellbeing information and alerts |

Employees with staff access may also receive self-service pages within other modules:

- Attendance: personal attendance, shifts, and leave.
- Compensation: personal benefits, rewards, insurance, claims, and reimbursements.
- Payroll: personal payslips, taxes, and reimbursement information.
- Onboarding: personal onboarding progress and tasks.
- Employee Relations: submit and track personal concerns.
- Offboarding: access their own exit-process information where applicable.
- Learning: view assigned courses and learning progress.
- Performance: view personal goals, reviews, and feedback.
- Helpdesk: raise and track personal support tickets.

The exact landing page should be selected according to the login experience and the employee's permissions.

---

## 5. Module functionality

The HRMS contains twelve modules. Each module has a distinct business responsibility but shares employee identity and organizational information through the central employee master.

### 5.1 Workforce Planning

**Suggested route:** `/workforce`

Workforce Planning helps HR and management understand current staffing, future employee requirements, and organizational capacity.

Key features:

- Bench management.
- Project rosters and employee allocation.
- Workforce capacity tracking.
- Headcount forecasting.
- Cost and workforce-gap analysis.
- Succession planning.
- Employee skills inventory.
- Diversity metrics.
- Scenario modelling.

**Access:** Admin and HR. Managers may access the permitted planning suite according to the role matrix.

### 5.2 Offboarding

**Suggested route:** `/offboarding`

Offboarding manages the employee exit lifecycle from resignation to final settlement and alumni records.

Process:

```text
Resignation Intake
       │
       ▼
Knowledge Transfer
       │
       ▼
Exit Interview
       │
       ▼
IT / Finance Clearance
       │
       ▼
Clearance Approvals
       │
       ▼
Final Settlement
       │
       ▼
Exit Documents
       │
       ▼
Alumni Records
```

Key features:

- Resignation intake and tracking.
- Knowledge-transfer management.
- Exit interviews.
- IT and Finance clearance.
- Clearance approval workflow.
- Final settlement tracking.
- Experience and relieving letters.
- Alumni records.
- Reports and audit log.

**Access:** Admin and HR manage the full lifecycle. Managers and employees access only their permitted, scoped pages.

### 5.3 Engagement

**Suggested routes:** `/engagement` and `/engagement/my-*`

Engagement provides tools for understanding employee satisfaction, collecting feedback, and supporting workplace wellbeing.

It has two user experiences over shared engagement data.

**Admin/HR console**

- Engagement dashboard.
- Survey creation and management.
- Survey analytics.
- Feedback management and analytics.
- Reports.
- Team insights.
- Wellness tracker.
- Recognition and rewards.
- Wellbeing alerts.
- Pulse-check management.

**Employee self-service**

- My Surveys.
- My Feedback.
- My Wellness.
- Recognition.
- Personal Wellness Dashboard.
- Pulse Check, if enabled.

**Access:** Admin and HR use the management console. Managers and employees use self-service pages.

### 5.4 Employee Relations

**Suggested route:** `/relations`

Employee Relations supports the intake, investigation, tracking, and resolution of workplace concerns.

Key features:

- Employee concerns intake.
- Active employee-relations cases.
- Policy deviations.
- Investigations.
- Corrective and disciplinary actions.
- Resolution sign-off.
- Strategic analytics.
- Optional AI-assisted grievance support and summarization.

**Access:** Admin and HR have management access. Managers receive the permitted case-console access. Employees can submit and view their own concerns.

AI assistance is an optional integration. If enabled, it must use a securely configured provider key on the backend. Core case-management functionality should remain usable without an AI integration.

### 5.5 Onboarding

**Suggested route:** `/onboarding`

Onboarding manages the process of bringing a new employee into the organization.

Key features:

- New-hire records.
- Pre-joining paperwork.
- Policy acknowledgement.
- Induction scheduling.
- Manager assignment.
- Training assignment.
- IT provisioning.
- Onboarding progress tracking.

Dashboard indicators may include:

- Total new hires.
- Pending and acknowledged handbooks.
- Pending and signed NDAs.
- Overall onboarding completion rate.

**Access:** Admin and HR manage the complete process. Managers access induction, training, and progress functions. Employees access their own onboarding tasks and status.

### 5.6 Attendance

**Suggested route:** `/attendance`

Attendance manages employee time and attendance information.

Key features:

- Clock-in and clock-out.
- Attendance history.
- Leave requests.
- Shift schedules.
- Overtime tracking.
- Holiday calendar.
- Monthly attendance calendar.
- Daily duty status.

Expense claims are handled through Compensation → Reimbursements rather than Attendance.

**Access:** Admin, HR, managers, and employees, with personal and team data scoping according to role.

### 5.7 Compensation

**Suggested route:** `/compensation`

Compensation manages employee benefits, rewards, insurance, salary grades, and reimbursement workflows.

Key features:

- Benefits administration.
- Salary grades.
- Rewards.
- Insurance.
- Benefit enrollment and renewal.
- Bonus management.
- Compensation benchmarking.
- Reports.
- Reimbursement submission and review.

Role-specific scope:

- **Admin/HR:** Full compensation administration.
- **Manager:** Review permitted team reimbursement requests.
- **Employee:** View personal rewards and submit reimbursement requests.

### 5.8 Payroll

**Suggested route:** `/payroll`

Payroll manages employee salary processing, payslips, deductions, taxes, and statutory activities.

Key features:

- Salary processing.
- Salary disbursement.
- Payslips.
- Taxes.
- Tax compliance.
- Statutory filing.
- Salary structures.
- Attendance and leave integration.
- Payroll audit.
- Reimbursement integration.

Role-specific scope:

- **Admin/HR:** Full payroll management.
- **Manager:** Permitted dashboard, salary-processing, attendance-integration, reimbursement, and team-payslip functions.
- **Employee:** Personal payslips, tax information, and reimbursement information.

The following functions should remain restricted to Admin/HR:

- Salary disbursement.
- Payroll audit.
- Tax compliance administration.
- Statutory filing.
- Salary structure administration.

Payroll records must be scoped on the backend. An employee's payslip request must never return another employee's salary information.

> **Security requirement:** Organization-wide payroll totals and salary data are confidential. Any dashboard that displays company-wide aggregates must be restricted to explicitly authorized roles.

### 5.9 Learning Management System (LMS)

**Suggested route:** `/lms`

The Learning Management System manages employee learning, training assignments, assessments, and certifications.

Key features:

- Course catalog.
- Learning paths.
- Course assignments.
- Assessments.
- Assessment questions and results.
- Certifications.
- Employee certificates.
- Announcements.
- Learning progress dashboards.

Role-specific scope:

- **Admin/HR:** Manage courses, assignments, certifications, and reports.
- **Manager:** Assign and track learning for the team.
- **Employee:** Access assigned courses, complete assessments, and view certificates.

### 5.10 Recruitment

**Suggested route:** `/recruitment`

Recruitment manages the hiring process from workforce requisition through candidate selection and offer issuance.

Key features:

- Hiring requisitions.
- Job openings and careers.
- Candidate records.
- Interview scheduling and feedback.
- Campus recruitment drives.
- Offer management.
- Tokenized candidate offer links.
- Offer PDF generation.
- Background verification.
- Candidate document collection.
- Optional AI-assisted job-description generation and resume parsing.

**Access:** Admin, HR, and managers. Employees do not have recruitment-module access.

Candidate-facing offer links may be accessible without an HRMS login when protected by secure, unguessable tokens with appropriate expiry and revocation. Candidate documents containing personal information must be served through authenticated, authorized routes or equivalent secure storage links.

#### 5.10.1 Requisition approval workflow

A hiring requisition requires two approval steps before it becomes Approved:

1. Approval by the manager of the department for which the employee is being hired.
2. Approval by an Admin/executive.

Both approvals should be recorded in an approval history or approval chain.

| Question | Rule |
|---|---|
| Who can create a requisition? | Admin, HR, or Manager |
| Who approves the manager step? | A manager whose department matches the requisition department |
| Who approves the admin step? | An authorized Admin/executive |
| Can HR approve the requisition? | HR may raise it but does not approve either step under this workflow |
| Can the requester approve their own requisition? | No, except for the narrowly defined last-resort case below |
| What can a manager view? | Their department's requisitions and requisitions they raised, subject to policy |
| What can Admin/HR view? | Organization-wide requisitions |

The requester identity must be derived from the authenticated server-side session. The backend must not trust a requester name or employee ID supplied in the request body.

**Department with no manager**

Some departments may not have a manager who can approve the first step. In that case, an Admin/executive may approve the manager step as an escalation.

The system should:

- Allow escalation only when the department has no eligible manager.
- Record that the approval was escalated.
- Store the reason and the identity of the person who approved it.
- Return an explicit escalation indicator in the API response.
- Avoid representing the escalation as a normal departmental manager approval.

**Last-resort self-approval**

A narrowly scoped exception may be required to avoid a deadlock when all of the following are true:

- The requester is an Admin.
- The department has no manager.
- No other Admin exists who can approve the request.

Only in this case may the sole Admin approve their own requisition. The approval record must explicitly identify it as self-approved and include the reason. If another eligible approver exists, self-approval must be rejected.

The checks must fail closed: if the system cannot verify the department's manager or the existence of another Admin because of a database or service error, it must not grant the exception.

**Example approval chain**

```text
Hiring Requisition Created
          │
          ▼
Department Manager Approval
          │
          ├── Eligible manager exists
          │       └── Manager approves
          │
          └── No manager exists
                  └── Admin approves as escalation
          │
          ▼
Admin / Executive Approval
          │
          ├── Separate Admin approves
          │
          └── Sole-Admin exception applies
                  └── Explicit self-approval record
          │
          ▼
Requisition Status: APPROVED
```

The API should return clear authorization errors. For example:

- “This requisition is for Sales. Only a manager of that department can approve it.”
- “You raised this requisition, so you cannot approve it.”
- “The requisition cannot be escalated because an eligible department manager exists.”

### 5.11 Performance Management

**Suggested route:** `/performance`

Performance Management supports employee goals, reviews, feedback, and skills tracking.

Key features:

- Goals and OKRs.
- Review and appraisal cycles.
- Progress tracking.
- Employee feedback.
- Skills management.
- Appraisal reports.

Role-specific scope:

- **Admin/HR:** Organization-level performance views and administration.
- **Manager:** Team goals, reviews, progress, and feedback.
- **Employee:** Personal goals, reviews, and feedback.

Appraisal reports are management-only. The Performance Improvement Plan (PIP) generator is not included in the current functional scope described by the source specification.

Performance records must be restricted to the employee, their authorized manager, and authorized HR/Admin users.

### 5.12 Helpdesk

**Suggested routes:** `/helpdesk` and `/helpdesk/employee-portal`

Helpdesk provides a centralized support-ticketing system for employee requests and HR operations.

Key features:

- Ticket creation and tracking.
- SLA monitoring.
- Ticket routing and escalation.
- Agent queues and workloads.
- Knowledge base.
- Ticket categories.
- Document requests.
- Document retrieval.
- Customer/employee satisfaction (CSAT) analytics.

**Agent console:** Admin, HR, and authorized managers can manage tickets, queues, routing, escalations, and support operations.

**Employee portal:** Employees can raise and track their own tickets, read published help articles, request documents, retrieve issued documents, and submit CSAT feedback.

#### Knowledge base

Knowledge-base articles follow this lifecycle:

```text
Draft
  │
  ▼
Awaiting Review
  │
  ▼
Published
  │
  ▼
Archived
```

- Staff can write and submit articles.
- HR/Admin control publishing, archiving, re-review, and deletion.
- An article's department is determined by its category.
- Employees can read published articles.
- Employees can submit one vote per article and change their vote.
- Matching articles can be suggested while an employee creates a ticket.
- An employee-facing chatbot may answer how-to questions using published knowledge-base content, if enabled.

#### Document retrieval

The Helpdesk document area provides a unified view of employee documents from the modules that generate or issue them.

Examples:

- Payslips from Payroll.
- Accepted offer letters from Recruitment.
- Final exit letters from Offboarding.
- HR-issued documents such as Form 16, salary certificates, and NOCs.

Access scope:

- Admin/HR: Documents for all employees, according to authorization.
- Manager: Their own documents and permitted direct-report documents.
- Employee: Their own documents.

Sensitive files must not be exposed through predictable public URLs. Offer and exit documents may use short-lived signed links or authenticated download endpoints. A document request is completed when an authorized staff member issues the file and the document becomes available in the employee's document list.

Agent dashboards, SLA administration, routing, escalation, and staff analytics must have staff-only authorization. Employee-facing actions such as submitting CSAT should be separately permissioned.

---

## 6. URL and API reference

The paths below are suggested React routes and REST API conventions for the new implementation. They should be aligned with the actual router and backend code during development.

### 6.1 Frontend route map

| Area | Suggested route |
|---|---|
| Main dashboard / module hub | `/dashboard` |
| HR/Admin/Manager login | `/login` |
| Employee login | `/employee/login` |
| Employee registration | `/employee/register` |
| Workforce Planning | `/workforce` |
| Offboarding | `/offboarding` |
| Engagement admin | `/engagement` |
| Engagement employee | `/engagement/my-surveys` |
| Employee Relations | `/relations` |
| Attendance | `/attendance` |
| Compensation | `/compensation` |
| Payroll | `/payroll` |
| Onboarding | `/onboarding` |
| Learning (LMS) | `/lms` |
| Recruitment | `/recruitment` |
| Performance | `/performance` |
| Helpdesk agent console | `/helpdesk` |
| Helpdesk employee portal | `/helpdesk/employee-portal` |

### 6.2 Suggested REST API conventions

Use a versioned API prefix so that future API changes can be introduced without unexpectedly breaking the frontend.

| Purpose | Suggested endpoint | Method |
|---|---|---|
| Staff login | `/api/v1/auth/login` | POST |
| Employee login | `/api/v1/employee/auth/login` | POST |
| Employee registration | `/api/v1/employee/auth/register` | POST |
| Current user profile | `/api/v1/auth/me` | GET |
| Logout | `/api/v1/auth/logout` | POST |
| Employee search | `/api/v1/employees/search?q=` | GET |
| Workforce APIs | `/api/v1/workforce/*` | As required |
| Offboarding APIs | `/api/v1/offboarding/*` | As required |
| Engagement APIs | `/api/v1/engagement/*` | As required |
| Relations APIs | `/api/v1/relations/*` | As required |
| Attendance APIs | `/api/v1/attendance/*` | As required |
| Compensation APIs | `/api/v1/compensation/*` | As required |
| Payroll APIs | `/api/v1/payroll/*` | As required |
| Onboarding APIs | `/api/v1/onboarding/*` | As required |
| LMS APIs | `/api/v1/lms/*` | As required |
| Recruitment APIs | `/api/v1/recruitment/*` | As required |
| Performance APIs | `/api/v1/performance/*` | As required |
| Helpdesk APIs | `/api/v1/helpdesk/*` | As required |
| Health check | `/health` | GET |

The `*` notation represents module-specific endpoints, not a single literal route.

### 6.3 Standard API response format

A consistent JSON response structure makes frontend integration easier.

Successful response example:

```json
{
  "success": true,
  "message": "Employee records retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

Error response example:

```json
{
  "success": false,
  "message": "You are not authorized to perform this action",
  "error": {
    "code": "FORBIDDEN"
  }
}
```

Use appropriate HTTP status codes, including:

- `200 OK` for successful reads and updates.
- `201 Created` for successful resource creation.
- `400 Bad Request` for invalid request data.
- `401 Unauthorized` for missing or invalid authentication.
- `403 Forbidden` for authenticated users without permission.
- `404 Not Found` for resources that do not exist or are not visible to the caller.
- `409 Conflict` for conflicting operations.
- `422 Unprocessable Entity` where validation conventions require it.
- `500 Internal Server Error` for unexpected server failures.

---

## 7. End-to-end workflows

### 7.1 HR onboards a new hire

```text
HR logs in
   │
   ▼
Dashboard → Onboarding
   │
   ▼
Add New Hire
   │
   ▼
Complete pre-joining paperwork / NDA
   │
   ▼
Assign manager
   │
   ▼
Schedule induction
   │
   ▼
Assign training and IT provisioning
   │
   ▼
Track progress until completion
```

### 7.2 Employee completes a survey

```text
Employee logs in
       │
       ▼
My Surveys
       │
       ▼
Opens an assigned survey
       │
       ▼
Submits responses
       │
       ▼
Responses are saved
       │
       ▼
Authorized HR/Admin users view analytics
```

### 7.3 Manager reviews a reimbursement

```text
Manager logs in
       │
       ▼
Compensation
       │
       ▼
Reimbursement Review
       │
       ▼
Opens a team reimbursement request
       │
       ▼
Reviews supporting information
       │
       ▼
Approves or rejects the request
```

### 7.4 Employee views a payslip

```text
Employee logs in
       │
       ▼
Payroll → Payslips
       │
       ▼
Backend verifies employee identity
       │
       ▼
Backend retrieves only that employee's payslips
       │
       ▼
Employee views or downloads a payslip
```

### 7.5 Hiring requisition approval

```text
HR / Manager / Admin creates requisition
                  │
                  ▼
        Department manager review
                  │
          ┌───────┴────────┐
          ▼                ▼
   Manager exists     No manager exists
          │                │
          ▼                ▼
   Manager approves   Admin escalation
          │                │
          └───────┬────────┘
                  ▼
          Admin approval
                  │
                  ▼
       Requisition is Approved
```

The sole-Admin self-approval exception applies only when the requester is the only Admin and the department has no manager. The exception must be explicitly recorded.

### 7.6 Employee offboarding

```text
HR opens Offboarding
         │
         ▼
Resignation intake
         │
         ▼
Knowledge transfer
         │
         ▼
Exit interview
         │
         ▼
IT / Finance clearance
         │
         ▼
Clearance approvals
         │
         ▼
Final settlement
         │
         ▼
Experience / relieving documents
         │
         ▼
Alumni record
```

---

## 8. Database design overview

The database uses PostgreSQL through Supabase. All modules share the same employee master record.

### 8.1 Shared employee master

The `employees` table is the central reference for employee identity and organizational details.

Typical fields may include:

- Employee ID / employee code.
- Full name.
- Email address.
- Phone number.
- Department.
- Designation or job title.
- Employment level.
- Manager / `reports_to` reference.
- Date of joining.
- Employment status.
- Password hash or reference to an external identity record, depending on the authentication design.
- Created and updated timestamps.

The final schema must be defined through database migrations. The list above is a conceptual field guide, not a statement that every field already exists.

### 8.2 Module data

Each module should own its operational tables while referencing the shared employee master where relevant.

| Module | Example data domains |
|---|---|
| Workforce Planning | Capacity, project allocation, skills, forecasts, succession |
| Offboarding | Resignations, exit interviews, clearances, settlements, exit documents |
| Engagement | Surveys, responses, feedback, wellness, recognition |
| Employee Relations | Concerns, cases, investigations, actions, resolutions |
| Attendance | Attendance records, leave requests, shifts, overtime, holidays |
| Compensation | Benefits, salary grades, rewards, insurance, reimbursements |
| Payroll | Payroll runs, payslips, tax records, disbursements, audits |
| Onboarding | New hires, paperwork, acknowledgements, induction, training, provisioning |
| LMS | Courses, learning paths, assignments, assessments, certificates |
| Recruitment | Requisitions, jobs, candidates, interviews, offers, verification |
| Performance | Goals, OKRs, reviews, feedback, skills |
| Helpdesk | Tickets, categories, queues, articles, document requests, CSAT |

### 8.3 Database practices

- Use primary keys and foreign keys consistently.
- Add indexes to frequently searched fields such as employee code, email, department, and foreign-key columns.
- Use transactions for multi-step operations such as payroll processing and approval workflows.
- Store timestamps consistently and define the application's timezone policy.
- Apply validation at both the API and database levels.
- Keep migrations version-controlled.
- Restrict access to sensitive employee, payroll, and candidate information.
- Avoid storing plaintext passwords, tokens, or secrets.
- Maintain audit records for sensitive administrative and approval actions.

---

## 9. Security and operational requirements

The HRMS handles confidential employee, compensation, payroll, recruitment, and workplace-relations data. Security must be applied across the frontend, backend, database, and file-delivery layers.

### 9.1 Authentication and authorization

- Hash passwords with a modern password-hashing algorithm.
- Sign and verify JWTs securely if JWT authentication is used.
- Keep signing secrets in environment variables or a managed secret store.
- Set appropriate token expiry and session-revocation behavior.
- Validate authorization on every protected backend route.
- Enforce record-level scoping for employee and manager data.
- Do not trust role, employee ID, requester, or department values supplied by the browser.

### 9.2 API security

- Validate and sanitize request bodies, query parameters, and route parameters.
- Configure CORS for the known frontend origins.
- Apply rate limiting to authentication and other abuse-sensitive endpoints.
- Use HTTPS in deployed environments.
- Avoid exposing stack traces or sensitive internal details in production errors.
- Log security-relevant events without logging passwords, tokens, or unnecessary personal data.

### 9.3 File and document security

- Restrict access to candidate documents, payslips, exit letters, and employee records.
- Validate file type and size on upload.
- Use private storage for sensitive files.
- Use short-lived signed links or authenticated downloads.
- Check the requesting user's access to the document before issuing a download.
- Do not expose sensitive documents through guessable public paths.

### 9.4 Auditability

Important events should be auditable, including:

- Login and authentication events.
- Employee record changes.
- Payroll processing and disbursement actions.
- Requisition approvals and escalations.
- Reimbursement approvals and rejections.
- Offboarding clearance and settlement.
- Access to or issuance of sensitive documents.
- Role and permission changes.

---

## 10. Environment configuration and local setup

The following is a suggested development setup for a split React frontend and Express backend. Exact scripts and variable names should be finalized in the project's `package.json` files and environment configuration.

### 10.1 Prerequisites

- Node.js (use a currently supported LTS release).
- npm or another compatible package manager.
- Supabase project with PostgreSQL database access.
- Git.
- A modern browser.

### 10.2 Install dependencies

Example commands:

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 10.3 Environment variables

Create a backend `.env` file using `.env.example` as a template.

Illustrative backend configuration:

```env
PORT=5000
NODE_ENV=development

SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1h

CLIENT_URL=http://localhost:5173
```

These names are proposed examples. Use the variable names required by the actual database client and authentication implementation.

**Important security rules:**

- Never commit `.env` files.
- Never expose a Supabase service-role key or JWT signing secret in the Vite frontend.
- Only expose intentionally public frontend variables using Vite's `VITE_` prefix.
- Keep privileged database access on the server.
- Use separate credentials and projects for development, testing, and production where practical.

### 10.4 Run the application

Start the Express backend:

```bash
cd server
npm run dev
```

Start the Vite frontend in another terminal:

```bash
cd client
npm run dev
```

The development URLs are typically:

- React/Vite frontend: `http://localhost:5173`
- Express API: `http://localhost:5000`

These are suggested defaults and may differ according to the project configuration.

### 10.5 Database provisioning

Database setup is a one-time operation per environment, followed by migrations as the schema evolves.

1. Create or select the Supabase project.
2. Configure server-side database credentials.
3. Apply the project's version-controlled migrations.
4. Seed development data only in non-production environments.
5. Verify employee relationships and role assignment rules.
6. Test that module queries enforce the expected data scope.

---

## 11. Notes, dependencies, and items to verify

The following points are important when implementing or migrating the system.

- **Separate login experiences:** The staff and employee login pages are distinct user experiences. Decide whether they share one underlying authentication service or use separate session audiences. Do not allow a session intended for one portal to bypass the permissions of the other.
- **Frontend and backend authorization:** React protected routes are for navigation and user experience. Express middleware and database query scoping must enforce security.
- **Role derivation:** The source business rules derive roles from employee level, department, and reporting relationships. Keep role derivation centralized and test changes to reporting structures.
- **Employee master:** All twelve modules should use the same employee identity and consistent employee references.
- **Engagement API separation:** Admin and employee operations should have clearly separated permissions and, where appropriate, distinct endpoint paths. Avoid ambiguous route collisions.
- **Payroll dashboard:** Company-wide payroll aggregates must be restricted to authorized Admin/HR users. Managers and employees should receive only their permitted views.
- **Manager and employee scope:** Module access does not imply unrestricted data access. Keep page permissions, operation permissions, and row-level data scope aligned.
- **Recruitment approvals:** Preserve the department-manager approval, Admin approval, escalation, and sole-Admin exception rules described in §5.10.1.
- **AI integrations:** Optional AI-assisted Employee Relations and Recruitment functions should be isolated behind server-side configuration. The core HRMS should continue to work when an AI provider is not configured.
- **File access:** Candidate documents, payroll documents, and exit documents require authorization and secure delivery.
- **Database provisioning:** Maintain migrations and seed scripts as part of the repository. Do not rely on undocumented manual database changes.
- **Production readiness:** Before launch, verify backups, monitoring, logging, rate limits, error handling, access control, file security, and recovery procedures.

### 11.1 Suggested validation checklist

- [ ] Staff login and employee login work as intended.
- [ ] Invalid credentials are rejected.
- [ ] Expired or invalid sessions cannot access protected APIs.
- [ ] Admin and HR can access their permitted management features.
- [ ] Managers can access only authorized team data and actions.
- [ ] Employees can access only their own personal records.
- [ ] Payroll and compensation data are correctly scoped.
- [ ] Recruitment approvals enforce the correct department and Admin steps.
- [ ] Escalation and sole-Admin self-approval are recorded explicitly.
- [ ] Sensitive files cannot be downloaded by unauthorized users.
- [ ] Module APIs validate and sanitize input.
- [ ] Database migrations can be applied to a clean environment.
- [ ] Optional AI functionality can be disabled without breaking core HR workflows.

---

## 12. Summary

The HRMS is a unified employee and human-resource operations platform built around a shared employee master and twelve interconnected modules:

1. Workforce Planning
2. Offboarding
3. Engagement
4. Employee Relations
5. Attendance
6. Compensation
7. Payroll
8. Onboarding
9. Learning Management System
10. Recruitment
11. Performance Management
12. Helpdesk

The React.js, Vite, and Tailwind CSS frontend provides role-specific interfaces for Admin/HR, Managers, and Employees. The Node.js and Express.js backend exposes REST APIs, handles authentication and business logic, and enforces RBAC and data-level access. Supabase PostgreSQL provides the shared relational database.

The design aims to keep HR operations connected while ensuring that each user can access only the information and actions permitted by their role.

---

*Documentation prepared for the HRMS project. This document is a technology-adapted functional and architectural specification based on the supplied OxiqAI HRMS documentation. Update implementation-specific details as the new project is developed.*
