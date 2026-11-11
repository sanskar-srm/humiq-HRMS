-- HRMS initial schema (Supabase PostgreSQL)
-- Apply with: supabase db push  (or psql "$DATABASE_URL" -f migrations/001_init.sql)
-- The API accesses these tables with the service-role key. RLS is enabled and
-- direct anon/authenticated access is revoked; all authorization is enforced
-- by the Express service layer. Do not expose the service-role key to clients.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Shared employee master and audit
-- ---------------------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  department text not null,
  designation text not null,
  employment_level text not null default 'IC',
  reports_to uuid references employees(id) on delete set null,
  date_of_joining date not null default current_date,
  employment_status text not null default 'Active',
  exit_date date,
  password_hash text not null,
  role text not null default 'Employee' check (role in ('Admin', 'HR', 'Manager', 'Employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists employees_email_lower_idx on employees (lower(email));
create index if not exists employees_department_idx on employees (department);
create index if not exists employees_reports_to_idx on employees (reports_to);
create index if not exists employees_role_idx on employees (role);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references employees(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_actor_idx on audit_logs (actor_id);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Workforce planning
-- ---------------------------------------------------------------------------
create table if not exists workforce_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text,
  status text not null default 'Planning' check (status in ('Planning', 'Active', 'On Hold', 'Completed')),
  start_date date,
  end_date date,
  budget numeric(14,2),
  description text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workforce_projects(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  allocation_percent int not null check (allocation_percent between 1 and 100),
  role text,
  start_date date,
  end_date date,
  status text not null default 'Active' check (status in ('Active', 'Ended')),
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workforce_allocations_employee_idx on workforce_allocations (employee_id);
create index if not exists workforce_allocations_project_idx on workforce_allocations (project_id);

create table if not exists workforce_forecasts (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  period text not null,
  current_headcount int not null default 0,
  forecast_headcount int not null default 0,
  gap int not null default 0,
  cost_impact numeric(14,2),
  notes text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workforce_forecasts_department_idx on workforce_forecasts (department);

create table if not exists employee_skills (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  skill text not null,
  proficiency text not null check (proficiency in ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  years_experience numeric(4,1) default 0,
  updated_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, skill)
);
create index if not exists employee_skills_employee_idx on employee_skills (employee_id);

create table if not exists succession_plans (
  id uuid primary key default gen_random_uuid(),
  position text not null,
  department text not null,
  current_holder_id uuid references employees(id) on delete set null,
  successor_id uuid not null references employees(id) on delete cascade,
  readiness text not null check (readiness in ('Ready Now', '1-2 Years', '3+ Years')),
  notes text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Offboarding
-- ---------------------------------------------------------------------------
create table if not exists offboarding_cases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  resignation_date date not null,
  last_working_date date not null,
  reason text,
  status text not null default 'Resignation Submitted' check (status in ('Resignation Submitted', 'Knowledge Transfer', 'Exit Interview', 'Clearance', 'Settlement', 'Documents', 'Completed', 'Withdrawn')),
  knowledge_transfer_status text not null default 'Pending',
  exit_interview_date date,
  exit_interview_notes text,
  final_settlement_amount numeric(14,2),
  settlement_status text not null default 'Pending',
  alumni_notes text,
  created_by uuid references employees(id) on delete set null,
  completed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_working_date >= resignation_date)
);
create index if not exists offboarding_cases_employee_idx on offboarding_cases (employee_id);
create index if not exists offboarding_cases_status_idx on offboarding_cases (status);

create table if not exists offboarding_clearances (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references offboarding_cases(id) on delete cascade,
  department text not null check (department in ('IT', 'Finance', 'Manager', 'HR')),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  approved_by uuid references employees(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offboarding_clearances_case_idx on offboarding_clearances (case_id);

create table if not exists exit_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references offboarding_cases(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  document_type text not null,
  file_name text not null,
  content text,
  issued_by uuid references employees(id) on delete set null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  clock_in text,
  clock_out text,
  status text not null default 'Present' check (status in ('Present', 'Late', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Work From Home')),
  overtime_hours numeric(5,2) not null default 0,
  leave_type text,
  notes text,
  source text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);
create index if not exists attendance_records_date_idx on attendance_records (date);
create index if not exists attendance_records_employee_idx on attendance_records (employee_id);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Paternity')),
  start_date date not null,
  end_date date not null,
  days int not null check (days > 0),
  reason text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  applied_by uuid references employees(id) on delete set null,
  approved_by uuid references employees(id) on delete set null,
  approved_at timestamptz,
  decision_note text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leave_requests_employee_idx on leave_requests (employee_id);
create index if not exists leave_requests_status_idx on leave_requests (status);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  shift_name text not null,
  start_time text not null,
  end_time text not null,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shifts_employee_date_idx on shifts (employee_id, date);

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null unique,
  description text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Compensation
-- ---------------------------------------------------------------------------
create table if not exists salary_grades (
  id uuid primary key default gen_random_uuid(),
  grade text not null unique,
  min_salary numeric(14,2) not null,
  max_salary numeric(14,2) not null,
  currency text not null default 'INR',
  description text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_salary >= min_salary)
);

create table if not exists employee_compensation (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references employees(id) on delete cascade,
  grade_id uuid references salary_grades(id) on delete set null,
  base_salary numeric(14,2) not null check (base_salary >= 0),
  allowances numeric(14,2) not null default 0 check (allowances >= 0),
  deductions numeric(14,2) not null default 0 check (deductions >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 60),
  currency text not null default 'INR',
  effective_date date,
  updated_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists benefits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  provider text,
  cost numeric(14,2) not null default 0,
  active boolean not null default true,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists benefit_enrollments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  benefit_id uuid not null references benefits(id) on delete cascade,
  status text not null default 'Active' check (status in ('Active', 'Cancelled')),
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists benefit_enrollments_active_idx on benefit_enrollments (employee_id, benefit_id) where status = 'Active';

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  title text not null,
  points int not null check (points > 0),
  note text,
  awarded_by uuid references employees(id) on delete set null,
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rewards_employee_idx on rewards (employee_id);

create table if not exists reimbursements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  category text not null check (category in ('Travel', 'Medical', 'Meals', 'Equipment', 'Training', 'Other')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  receipt_url text,
  status text not null default 'Submitted' check (status in ('Submitted', 'Manager Approved', 'Approved', 'Rejected')),
  manager_id uuid references employees(id) on delete set null,
  manager_approved_by uuid references employees(id) on delete set null,
  manager_approved_at timestamptz,
  hr_approved_by uuid references employees(id) on delete set null,
  hr_approved_at timestamptz,
  rejected_by uuid references employees(id) on delete set null,
  rejected_at timestamptz,
  decision_note text,
  payroll_run_id uuid,
  submitted_by uuid references employees(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reimbursements_employee_idx on reimbursements (employee_id);
create index if not exists reimbursements_status_idx on reimbursements (status);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  status text not null default 'Draft' check (status in ('Draft', 'Processed', 'Disbursed', 'Cancelled')),
  processed_by uuid references employees(id) on delete set null,
  processed_at timestamptz,
  disbursed_by uuid references employees(id) on delete set null,
  disbursed_at timestamptz,
  total_gross numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  total_net numeric(14,2) not null default 0,
  employee_count int not null default 0,
  skipped jsonb not null default '[]'::jsonb,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payroll_runs_period_idx on payroll_runs (period) where status <> 'Cancelled';

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  period text not null,
  basic numeric(14,2) not null default 0,
  allowances numeric(14,2) not null default 0,
  reimbursements numeric(14,2) not null default 0,
  gross_pay numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  attendance_deduction numeric(14,2) not null default 0,
  unpaid_leave_days int not null default 0,
  tax numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  currency text not null default 'INR',
  status text not null default 'Processed' check (status in ('Processed', 'Paid', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index if not exists payslips_employee_idx on payslips (employee_id);
create index if not exists payslips_period_idx on payslips (period);

alter table reimbursements
  add constraint reimbursements_payroll_run_fk
  foreign key (payroll_run_id) references payroll_runs(id) on delete set null;

create table if not exists tax_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  period text not null,
  taxable_income numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  status text not null default 'Draft' check (status in ('Draft', 'Filed')),
  filed_at timestamptz,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tax_records_employee_idx on tax_records (employee_id);

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------
create table if not exists onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  candidate_name text not null,
  email text,
  department text not null,
  designation text not null,
  joining_date date not null,
  manager_id uuid references employees(id) on delete set null,
  status text not null default 'Not Started' check (status in ('Not Started', 'In Progress', 'Completed', 'Cancelled')),
  progress int not null default 0 check (progress between 0 and 100),
  completed_at timestamptz,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboarding_cases_employee_idx on onboarding_cases (employee_id);
create index if not exists onboarding_cases_manager_idx on onboarding_cases (manager_id);

create table if not exists onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references onboarding_cases(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  title text not null,
  category text not null check (category in ('Paperwork', 'Induction', 'Training', 'IT Provisioning', 'Other')),
  assigned_to uuid references employees(id) on delete set null,
  due_date date,
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboarding_tasks_case_idx on onboarding_tasks (case_id);

create table if not exists onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references onboarding_cases(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  document_type text not null check (document_type in ('Handbook', 'NDA', 'Policy', 'Tax Form', 'Other')),
  file_name text,
  status text not null default 'Pending' check (status in ('Pending', 'Acknowledged', 'Signed')),
  acknowledged_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recruitment
-- ---------------------------------------------------------------------------
create table if not exists job_requisitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  position_count int not null check (position_count > 0),
  employment_type text not null default 'Full Time',
  budget numeric(14,2),
  description text,
  status text not null default 'Pending Manager' check (status in ('Pending Manager', 'Pending Admin', 'Approved', 'Rejected', 'Closed')),
  requester_id uuid not null references employees(id) on delete restrict,
  decision_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_requisitions_department_idx on job_requisitions (department);
create index if not exists job_requisitions_status_idx on job_requisitions (status);
create index if not exists job_requisitions_requester_idx on job_requisitions (requester_id);

create table if not exists requisition_approvals (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references job_requisitions(id) on delete cascade,
  approver_id uuid not null references employees(id) on delete restrict,
  step text not null check (step in ('Manager', 'Admin')),
  status text not null check (status in ('Approved', 'Rejected')),
  is_escalation boolean not null default false,
  is_self_approval boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists requisition_approvals_req_idx on requisition_approvals (requisition_id);

create table if not exists job_openings (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references job_requisitions(id) on delete cascade,
  title text not null,
  department text not null,
  location text,
  employment_type text,
  status text not null default 'Open' check (status in ('Open', 'Closed', 'On Hold')),
  posted_at timestamptz,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references job_requisitions(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  resume_url text,
  stage text not null default 'Applied' check (stage in ('Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected', 'Withdrawn')),
  status text not null default 'Active' check (status in ('Active', 'Hired', 'Rejected', 'Withdrawn')),
  source text,
  notes text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requisition_id, email)
);
create index if not exists candidates_requisition_idx on candidates (requisition_id);
create index if not exists candidates_stage_idx on candidates (stage);

create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  interviewer_id uuid not null references employees(id) on delete restrict,
  scheduled_at timestamptz not null,
  mode text not null default 'Video',
  location text,
  status text not null default 'Scheduled' check (status in ('Scheduled', 'Completed', 'Cancelled', 'No Show')),
  feedback text,
  rating int check (rating between 1 and 5),
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interviews_candidate_idx on interviews (candidate_id);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  designation text not null,
  salary numeric(14,2) not null check (salary > 0),
  currency text not null default 'INR',
  joining_date date,
  status text not null default 'Draft' check (status in ('Draft', 'Issued', 'Accepted', 'Declined', 'Revoked')),
  token text unique,
  issued_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_token_idx on offers (token);

-- ---------------------------------------------------------------------------
-- Performance
-- ---------------------------------------------------------------------------
create table if not exists review_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'Active' check (status in ('Draft', 'Active', 'Closed')),
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  cycle_id uuid references review_cycles(id) on delete set null,
  title text not null,
  description text,
  target text,
  progress int not null default 0 check (progress between 0 and 100),
  weightage int not null default 0 check (weightage between 0 and 100),
  status text not null default 'Not Started' check (status in ('Not Started', 'In Progress', 'Completed', 'At Risk', 'Cancelled')),
  manager_id uuid references employees(id) on delete set null,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_employee_idx on goals (employee_id);
create index if not exists goals_cycle_idx on goals (cycle_id);

create table if not exists performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  cycle_id uuid not null references review_cycles(id) on delete cascade,
  reviewer_id uuid not null references employees(id) on delete restrict,
  rating int check (rating between 1 and 5),
  strengths text,
  improvements text,
  comments text,
  status text not null default 'Draft' check (status in ('Draft', 'In Progress', 'Submitted', 'Acknowledged', 'Completed')),
  submitted_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, cycle_id)
);
create index if not exists performance_reviews_employee_idx on performance_reviews (employee_id);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  from_employee_id uuid not null references employees(id) on delete cascade,
  type text not null check (type in ('Praise', 'Constructive', 'Peer', 'Manager')),
  message text not null,
  visibility text not null default 'Manager and HR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_employee_idx on feedback (employee_id);

-- ---------------------------------------------------------------------------
-- Helpdesk
-- ---------------------------------------------------------------------------
create table if not exists ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  department text not null,
  sla_hours int not null default 24 check (sla_hours between 1 and 720),
  default_assignee_id uuid references employees(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  employee_id uuid not null references employees(id) on delete cascade,
  category_id uuid not null references ticket_categories(id) on delete restrict,
  subject text not null,
  description text not null,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Pending', 'Escalated', 'Resolved', 'Closed')),
  assigned_to uuid references employees(id) on delete set null,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  escalation_reason text,
  csat_rating int check (csat_rating between 1 and 5),
  csat_comment text,
  csat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_employee_idx on tickets (employee_id);
create index if not exists tickets_status_idx on tickets (status);
create index if not exists tickets_assigned_idx on tickets (assigned_to);

create table if not exists ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id uuid not null references employees(id) on delete restrict,
  message text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_idx on ticket_comments (ticket_id);

create table if not exists kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category_id uuid references ticket_categories(id) on delete set null,
  department text,
  status text not null default 'Draft' check (status in ('Draft', 'Awaiting Review', 'Published', 'Archived')),
  author_id uuid references employees(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kb_articles_status_idx on kb_articles (status);

create table if not exists kb_votes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references kb_articles(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  vote text not null check (vote in ('Helpful', 'Not Helpful')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, employee_id)
);

create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  source_module text not null,
  content text,
  issued_by uuid references employees(id) on delete set null,
  issued_at timestamptz not null default now(),
  request_id uuid,
  case_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_documents_employee_idx on employee_documents (employee_id);

create table if not exists document_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  document_type text not null,
  reason text,
  status text not null default 'Pending' check (status in ('Pending', 'Issued', 'Rejected')),
  issued_document_id uuid references employee_documents(id) on delete set null,
  issued_by uuid references employees(id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_requests_employee_idx on document_requests (employee_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'employees', 'workforce_projects', 'workforce_allocations', 'workforce_forecasts', 'employee_skills', 'succession_plans',
    'offboarding_cases', 'offboarding_clearances', 'exit_documents', 'attendance_records', 'leave_requests', 'shifts', 'holidays',
    'salary_grades', 'employee_compensation', 'benefits', 'benefit_enrollments', 'rewards', 'reimbursements', 'payroll_runs',
    'payslips', 'tax_records', 'onboarding_cases', 'onboarding_tasks', 'onboarding_documents', 'job_requisitions',
    'job_openings', 'candidates', 'interviews', 'offers', 'review_cycles', 'goals', 'performance_reviews', 'feedback',
    'ticket_categories', 'tickets', 'kb_articles', 'kb_votes', 'employee_documents', 'document_requests'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %I', tbl);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', tbl);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: deny-by-default for anon/authenticated.
-- The Express API uses the service-role key (bypasses RLS) and scopes every
-- query in the service layer. Direct client database access is not used.
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'employees', 'audit_logs', 'workforce_projects', 'workforce_allocations', 'workforce_forecasts', 'employee_skills',
    'succession_plans', 'offboarding_cases', 'offboarding_clearances', 'exit_documents', 'attendance_records',
    'leave_requests', 'shifts', 'holidays', 'salary_grades', 'employee_compensation', 'benefits', 'benefit_enrollments',
    'rewards', 'reimbursements', 'payroll_runs', 'payslips', 'tax_records', 'onboarding_cases', 'onboarding_tasks',
    'onboarding_documents', 'job_requisitions', 'requisition_approvals', 'job_openings', 'candidates', 'interviews',
    'offers', 'review_cycles', 'goals', 'performance_reviews', 'feedback', 'ticket_categories', 'tickets',
    'ticket_comments', 'kb_articles', 'kb_votes', 'employee_documents', 'document_requests'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    execute format('revoke all on table %I from anon, authenticated', tbl);
  end loop;
end $$;
