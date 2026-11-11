-- Engagement, Employee Relations, and LMS modules
-- Apply after 001_init.sql

-- ---------------------------------------------------------------------------
-- Engagement
-- ---------------------------------------------------------------------------
create table if not exists engagement_surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'Closed')),
  start_date date,
  end_date date,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists engagement_surveys_status_idx on engagement_surveys (status);

create table if not exists engagement_survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references engagement_surveys(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'Rating' check (question_type in ('Rating', 'Text', 'Choice')),
  options jsonb default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists engagement_survey_questions_survey_idx on engagement_survey_questions (survey_id);

create table if not exists engagement_survey_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references engagement_surveys(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  status text not null default 'Pending' check (status in ('Pending', 'Completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (survey_id, employee_id)
);
create index if not exists engagement_survey_assignments_employee_idx on engagement_survey_assignments (employee_id);

create table if not exists engagement_survey_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references engagement_survey_assignments(id) on delete cascade,
  question_id uuid not null references engagement_survey_questions(id) on delete cascade,
  answer_text text,
  answer_rating int check (answer_rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (assignment_id, question_id)
);

create table if not exists engagement_feedback (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  category text not null default 'General' check (category in ('General', 'Manager', 'Workplace', 'Suggestion', 'Other')),
  message text not null,
  status text not null default 'Submitted' check (status in ('Submitted', 'Reviewed', 'Closed')),
  reviewed_by uuid references employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists engagement_feedback_employee_idx on engagement_feedback (employee_id);

create table if not exists engagement_wellness_checkins (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  mood_score int not null check (mood_score between 1 and 5),
  stress_level int check (stress_level between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists engagement_wellness_employee_idx on engagement_wellness_checkins (employee_id);

create table if not exists engagement_recognition (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  points int not null default 0 check (points >= 0),
  badge text,
  reason text,
  awarded_by uuid references employees(id) on delete set null,
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists engagement_recognition_employee_idx on engagement_recognition (employee_id);

create table if not exists engagement_pulse_polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  status text not null default 'Active' check (status in ('Draft', 'Active', 'Closed')),
  closes_at timestamptz,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists engagement_pulse_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references engagement_pulse_polls(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  response text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Employee Relations
-- ---------------------------------------------------------------------------
create table if not exists er_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  employee_id uuid not null references employees(id) on delete restrict,
  subject text not null,
  description text not null,
  category text not null default 'Concern' check (category in ('Concern', 'Grievance', 'Policy Deviation', 'Harassment', 'Other')),
  status text not null default 'Intake' check (status in ('Intake', 'Investigation', 'Action', 'Resolution', 'Closed')),
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  assigned_to uuid references employees(id) on delete set null,
  investigation_notes text,
  corrective_action text,
  resolution_summary text,
  resolved_at timestamptz,
  resolved_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists er_cases_employee_idx on er_cases (employee_id);
create index if not exists er_cases_status_idx on er_cases (status);

-- ---------------------------------------------------------------------------
-- LMS
-- ---------------------------------------------------------------------------
create table if not exists lms_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  duration_hours numeric(5,1) not null default 1,
  category text,
  status text not null default 'Draft' check (status in ('Draft', 'Published', 'Archived')),
  content text,
  created_by uuid references employees(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lms_courses_status_idx on lms_courses (status);

create table if not exists lms_course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references lms_courses(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  status text not null default 'Assigned' check (status in ('Assigned', 'In Progress', 'Completed')),
  progress int not null default 0 check (progress between 0 and 100),
  due_date date,
  completed_at timestamptz,
  assigned_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, employee_id)
);
create index if not exists lms_course_assignments_employee_idx on lms_course_assignments (employee_id);

create table if not exists lms_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references lms_courses(id) on delete cascade,
  title text not null,
  pass_score int not null default 70 check (pass_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lms_assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references lms_assessments(id) on delete cascade,
  question_text text not null,
  correct_answer text not null,
  options jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lms_assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references lms_assessments(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  score int not null check (score between 0 and 100),
  passed boolean not null default false,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists lms_assessment_results_employee_idx on lms_assessment_results (employee_id);

create table if not exists lms_certificates (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references lms_courses(id) on delete cascade,
  name text not null,
  valid_months int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lms_employee_certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references lms_certificates(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (certificate_id, employee_id)
);

create table if not exists lms_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  status text not null default 'Published' check (status in ('Draft', 'Published', 'Archived')),
  published_at timestamptz,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'engagement_surveys', 'engagement_survey_questions', 'engagement_survey_assignments', 'engagement_survey_responses',
    'engagement_feedback', 'engagement_wellness_checkins', 'engagement_recognition', 'engagement_pulse_polls', 'engagement_pulse_responses',
    'er_cases', 'lms_courses', 'lms_course_assignments', 'lms_assessments', 'lms_assessment_questions', 'lms_assessment_results',
    'lms_certificates', 'lms_employee_certificates', 'lms_announcements'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %I', tbl);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', tbl);
  end loop;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'engagement_surveys', 'engagement_survey_questions', 'engagement_survey_assignments', 'engagement_survey_responses',
    'engagement_feedback', 'engagement_wellness_checkins', 'engagement_recognition', 'engagement_pulse_polls', 'engagement_pulse_responses',
    'er_cases', 'lms_courses', 'lms_course_assignments', 'lms_assessments', 'lms_assessment_questions', 'lms_assessment_results',
    'lms_certificates', 'lms_employee_certificates', 'lms_announcements'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    execute format('revoke all on table %I from anon, authenticated', tbl);
  end loop;
end $$;
