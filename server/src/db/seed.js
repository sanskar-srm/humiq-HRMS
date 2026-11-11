import bcrypt from 'bcryptjs';
import config from '../config/env.js';

const iso = (date) => date.toISOString();
const currentYear = () => new Date().getUTCFullYear();
const day = (offset = 0) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const previousMonth = () => {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
};
const monthEnd = (period) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export const DEMO_ACCOUNTS = [
  { employee_code: 'EMP001', full_name: 'Sanskar', email: 'sanskar@hrms.local', role: 'Admin' },
  { employee_code: 'EMP002', full_name: 'Himanshu', email: 'himanshu@hrms.local', role: 'HR' },
  { employee_code: 'EMP004', full_name: 'Tejas', email: 'tejas@hrms.local', role: 'Manager' },
  { employee_code: 'EMP005', full_name: 'Emp_1', email: 'emp1@hrms.local', role: 'Employee' },
];

/**
 * Keeps the four demo identities in sync without deleting or reseeding live rows.
 * Existing passwords are intentionally preserved.
 */
export async function syncDemoAccounts(db) {
  const updated = [];
  for (const account of DEMO_ACCOUNTS) {
    const [existing] = await db.select('employees', {
      where: { employee_code: account.employee_code },
      limit: 1,
    });
    if (!existing) continue;
    const [row] = await db.update(
      'employees',
      { id: existing.id },
      {
        full_name: account.full_name,
        email: account.email,
        role: account.role,
      },
    );
    updated.push(row ?? { ...existing, ...account });
  }
  return updated;
}

export async function seed(db) {
  const passwordHash = await bcrypt.hash(config.seedPassword, 12);
  const insertEmployee = async (data) => db.insert('employees', {
    password_hash: passwordHash,
    is_active: true,
    employment_status: 'Active',
    employment_level: 'IC',
    date_of_joining: day(-400),
    ...data,
  });

  const ceo = await insertEmployee({ employee_code: 'EMP001', full_name: 'Sanskar', email: 'sanskar@hrms.local', phone: '+91 98000 00001', department: 'Executive', designation: 'Chief Executive Officer', employment_level: 'CEO', reports_to: null, date_of_joining: '2018-04-02' });
  const hrHead = await insertEmployee({ employee_code: 'EMP002', full_name: 'Himanshu', email: 'himanshu@hrms.local', phone: '+91 98000 00002', department: 'HR', designation: 'HR Director', employment_level: 'Director', reports_to: ceo.id, date_of_joining: '2019-06-10' });
  const hrExec = await insertEmployee({ employee_code: 'EMP003', full_name: 'Neha Verma', email: 'neha.verma@hrms.local', phone: '+91 98000 00003', department: 'HR', designation: 'HR Executive', reports_to: hrHead.id, date_of_joining: '2021-01-18' });
  const engManager = await insertEmployee({ employee_code: 'EMP004', full_name: 'Tejas', email: 'tejas@hrms.local', phone: '+91 98000 00004', department: 'Engineering', designation: 'Engineering Manager', employment_level: 'Manager', reports_to: ceo.id, date_of_joining: '2020-02-17' });
  const aarav = await insertEmployee({ employee_code: 'EMP005', full_name: 'Emp_1', email: 'emp1@hrms.local', phone: '+91 98000 00005', department: 'Engineering', designation: 'Senior Software Engineer', reports_to: engManager.id, date_of_joining: '2022-03-14' });
  const diya = await insertEmployee({ employee_code: 'EMP006', full_name: 'Diya Patel', email: 'diya.patel@hrms.local', phone: '+91 98000 00006', department: 'Engineering', designation: 'QA Engineer', reports_to: engManager.id, date_of_joining: '2023-07-03' });
  const salesManager = await insertEmployee({ employee_code: 'EMP007', full_name: 'Meera Iyer', email: 'meera.iyer@hrms.local', phone: '+91 98000 00007', department: 'Sales', designation: 'Sales Manager', employment_level: 'Manager', reports_to: ceo.id, date_of_joining: '2020-09-01' });
  const kabir = await insertEmployee({ employee_code: 'EMP008', full_name: 'Kabir Rao', email: 'kabir.rao@hrms.local', phone: '+91 98000 00008', department: 'Sales', designation: 'Sales Executive', reports_to: salesManager.id, date_of_joining: '2024-01-15' });
  const rohan = await insertEmployee({ employee_code: 'EMP009', full_name: 'Rohan Gupta', email: 'rohan.gupta@hrms.local', phone: '+91 98000 00009', department: 'Finance', designation: 'Finance Analyst', reports_to: ceo.id, date_of_joining: '2022-11-21' });
  const ananya = await insertEmployee({ employee_code: 'EMP010', full_name: 'Ananya Nair', email: 'ananya.nair@hrms.local', phone: '+91 98000 00010', department: 'Marketing', designation: 'Marketing Specialist', reports_to: ceo.id, date_of_joining: '2023-02-06' });

  // Derived roles, calculated centrally from reporting lines and department rules.
  const allEmployees = await db.select('employees', { limit: 1000 });
  for (const employee of allEmployees) {
    const reports = allEmployees.filter((item) => item.reports_to === employee.id).length;
    let role = 'Employee';
    if (['CEO', 'President', 'AVP'].includes(employee.employment_level) || employee.department === 'Executive') role = 'Admin';
    else if (employee.department === 'HR') role = 'HR';
    else if (reports > 0) role = 'Manager';
    await db.update('employees', { id: employee.id }, { role });
  }

  // Workforce planning
  const projectA = await db.insert('workforce_projects', { name: 'Platform Modernization', department: 'Engineering', status: 'Active', start_date: day(-120), end_date: day(180), budget: 8500000, description: 'Rebuild the core platform on a modular service architecture.', created_by: hrHead.id });
  const projectB = await db.insert('workforce_projects', { name: 'Sales Expansion â€” West', department: 'Sales', status: 'Active', start_date: day(-60), end_date: day(240), budget: 4200000, description: 'Expand enterprise coverage in the western region.', created_by: hrHead.id });
  await db.insertMany('workforce_allocations', [
    { project_id: projectA.id, employee_id: aarav.id, allocation_percent: 80, role: 'Tech Lead', start_date: day(-110), status: 'Active', created_by: hrHead.id },
    { project_id: projectA.id, employee_id: diya.id, allocation_percent: 60, role: 'QA Lead', start_date: day(-100), status: 'Active', created_by: hrHead.id },
    { project_id: projectB.id, employee_id: kabir.id, allocation_percent: 50, role: 'Account Executive', start_date: day(-50), status: 'Active', created_by: hrHead.id },
  ]);
  await db.insertMany('workforce_forecasts', [
    { department: 'Engineering', period: `FY ${currentYear()}-${String((currentYear() + 1) % 100).padStart(2, '0')}`, current_headcount: 3, forecast_headcount: 6, gap: 3, cost_impact: 7200000, notes: 'Two backend engineers and one QA automation engineer.', created_by: hrHead.id },
    { department: 'Sales', period: `FY ${currentYear()}-${String((currentYear() + 1) % 100).padStart(2, '0')}`, current_headcount: 2, forecast_headcount: 4, gap: 2, cost_impact: 3600000, notes: 'Regional account executives.', created_by: hrHead.id },
  ]);
  await db.insertMany('employee_skills', [
    { employee_id: aarav.id, skill: 'Node.js', proficiency: 'Expert', years_experience: 6 },
    { employee_id: aarav.id, skill: 'PostgreSQL', proficiency: 'Advanced', years_experience: 5 },
    { employee_id: diya.id, skill: 'Test Automation', proficiency: 'Advanced', years_experience: 4 },
    { employee_id: kabir.id, skill: 'Enterprise Sales', proficiency: 'Intermediate', years_experience: 3 },
  ]);
  await db.insert('succession_plans', { position: 'Engineering Manager', department: 'Engineering', current_holder_id: engManager.id, successor_id: aarav.id, readiness: '1-2 Years', notes: 'Strong technical leadership; needs people-management exposure.', created_by: hrHead.id });

  // Attendance, leave, shifts and holidays
  const attendanceRows = [];
  for (let offset = -12; offset <= 0; offset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    if ([0, 6].includes(date.getUTCDay())) continue;
    for (const employee of [ceo, hrHead, hrExec, engManager, aarav, diya, salesManager, kabir, rohan, ananya]) {
      attendanceRows.push({
        employee_id: employee.id,
        date: date.toISOString().slice(0, 10),
        clock_in: '09:05',
        clock_out: offset === 0 ? null : '18:15',
        status: 'Present',
        overtime_hours: offset % 5 === 0 ? 0.5 : 0,
        source: 'seed',
      });
    }
  }
  await db.insertMany('attendance_records', attendanceRows);
  await db.insertMany('leave_requests', [
    { employee_id: aarav.id, leave_type: 'Casual', start_date: day(5), end_date: day(6), days: 2, reason: 'Family function', status: 'Pending', applied_by: aarav.id },
    { employee_id: diya.id, leave_type: 'Sick', start_date: day(-3), end_date: day(-3), days: 1, reason: 'Medical appointment', status: 'Approved', applied_by: diya.id, approved_by: engManager.id, approved_at: iso(new Date()) },
    { employee_id: kabir.id, leave_type: 'Earned', start_date: day(12), end_date: day(14), days: 3, reason: 'Personal travel', status: 'Pending', applied_by: kabir.id },
  ]);
  await db.insertMany('shifts', [
    { employee_id: aarav.id, date: day(1), shift_name: 'General', start_time: '09:00', end_time: '18:00', created_by: hrHead.id },
    { employee_id: diya.id, date: day(1), shift_name: 'General', start_time: '09:00', end_time: '18:00', created_by: hrHead.id },
    { employee_id: kabir.id, date: day(1), shift_name: 'General', start_time: '09:00', end_time: '18:00', created_by: hrHead.id },
  ]);
  await db.insertMany('holidays', [
    { name: 'Republic Day', date: `${new Date().getUTCFullYear()}-01-26`, description: 'National holiday' },
    { name: 'Independence Day', date: `${new Date().getUTCFullYear()}-08-15`, description: 'National holiday' },
    { name: 'Diwali', date: `${new Date().getUTCFullYear()}-11-08`, description: 'Festival of lights' },
  ]);

  // Compensation
  const gradeL1 = await db.insert('salary_grades', { grade: 'L1 â€” Associate', min_salary: 300000, max_salary: 600000, currency: 'INR', description: 'Entry level', created_by: hrHead.id });
  const gradeL2 = await db.insert('salary_grades', { grade: 'L2 â€” Professional', min_salary: 600001, max_salary: 1200000, currency: 'INR', description: 'Individual contributor', created_by: hrHead.id });
  const gradeL3 = await db.insert('salary_grades', { grade: 'L3 â€” Senior', min_salary: 1200001, max_salary: 2400000, currency: 'INR', description: 'Senior professional', created_by: hrHead.id });
  const gradeL4 = await db.insert('salary_grades', { grade: 'L4 â€” Leadership', min_salary: 2400001, max_salary: 6000000, currency: 'INR', description: 'People and function leadership', created_by: hrHead.id });
  const structures = [
    [ceo, gradeL4, 4800000], [hrHead, gradeL4, 2800000], [hrExec, gradeL2, 780000], [engManager, gradeL4, 2600000],
    [aarav, gradeL3, 1850000], [diya, gradeL2, 980000], [salesManager, gradeL3, 2100000], [kabir, gradeL2, 720000],
    [rohan, gradeL2, 860000], [ananya, gradeL2, 760000],
  ];
  for (const [employee, grade, base] of structures) {
    await db.insert('employee_compensation', {
      employee_id: employee.id,
      grade_id: grade.id,
      base_salary: base,
      allowances: Math.round(base * 0.1),
      deductions: Math.round(base * 0.05),
      tax_percent: 10,
      currency: 'INR',
      effective_date: day(-180),
      updated_by: hrHead.id,
    });
  }
  const health = await db.insert('benefits', { name: 'Health Insurance', description: 'Family floater cover of INR 10 lakh', provider: 'SecureLife', cost: 24000, active: true, created_by: hrHead.id });
  const pf = await db.insert('benefits', { name: 'Provident Fund', description: 'Statutory retirement contribution', provider: 'EPFO', cost: 0, active: true, created_by: hrHead.id });
  const meals = await db.insert('benefits', { name: 'Meal Allowance', description: 'Monthly meal card', provider: 'Cafeteria Co.', cost: 36000, active: true, created_by: hrHead.id });
  await db.insertMany('benefit_enrollments', [
    { employee_id: aarav.id, benefit_id: health.id, status: 'Active', enrolled_at: iso(new Date()), enrolled_by: aarav.id },
    { employee_id: aarav.id, benefit_id: pf.id, status: 'Active', enrolled_at: iso(new Date()), enrolled_by: aarav.id },
    { employee_id: diya.id, benefit_id: health.id, status: 'Active', enrolled_at: iso(new Date()), enrolled_by: diya.id },
    { employee_id: kabir.id, benefit_id: meals.id, status: 'Active', enrolled_at: iso(new Date()), enrolled_by: kabir.id },
  ]);
  await db.insertMany('rewards', [
    { employee_id: aarav.id, title: 'Engineering Excellence Award', points: 500, note: 'Led the platform migration.', awarded_by: hrHead.id, awarded_at: iso(new Date()) },
    { employee_id: diya.id, title: 'Quality Champion', points: 250, note: 'Reduced escaped defects by 40%.', awarded_by: engManager.id, awarded_at: iso(new Date()) },
  ]);
  await db.insertMany('reimbursements', [
    { employee_id: aarav.id, category: 'Travel', amount: 4800, description: 'Client visit â€” Pune', status: 'Submitted', manager_id: engManager.id, submitted_by: aarav.id },
    { employee_id: diya.id, category: 'Training', amount: 12000, description: 'ISTQB certification fee', status: 'Manager Approved', manager_id: engManager.id, manager_approved_by: engManager.id, manager_approved_at: iso(new Date()), submitted_by: diya.id },
    { employee_id: kabir.id, category: 'Meals', amount: 2200, description: 'Customer workshop refreshments', status: 'Submitted', manager_id: salesManager.id, submitted_by: kabir.id },
  ]);

  // Payroll history
  const period = previousMonth();
  const run = await db.insert('payroll_runs', {
    period,
    status: 'Disbursed',
    processed_by: hrHead.id,
    processed_at: iso(new Date()),
    disbursed_by: ceo.id,
    disbursed_at: iso(new Date()),
    total_gross: 0,
    total_deductions: 0,
    total_net: 0,
    employee_count: structures.length,
    created_by: hrHead.id,
  });
  let grossTotal = 0;
  let deductionTotal = 0;
  let netTotal = 0;
  for (const [employee, , base] of structures) {
    const allowances = Math.round(base * 0.1);
    const deductions = Math.round(base * 0.05);
    const gross = base + allowances;
    const tax = Math.round(gross * 0.1);
    const net = gross - tax - deductions;
    grossTotal += gross;
    deductionTotal += tax + deductions;
    netTotal += net;
    await db.insert('payslips', {
      run_id: run.id, employee_id: employee.id, period, basic: base, allowances, reimbursements: 0,
      gross_pay: gross, deductions, attendance_deduction: 0, unpaid_leave_days: 0, tax, net_pay: net,
      currency: 'INR', status: 'Paid',
    });
  }
  await db.update('payroll_runs', { id: run.id }, { total_gross: grossTotal, total_deductions: deductionTotal, total_net: netTotal });
  await db.insert('tax_records', { employee_id: aarav.id, period, taxable_income: 1800000, tax_amount: 180000, status: 'Filed', filed_at: iso(new Date()), created_by: hrHead.id });

  // Onboarding
  const onboarding = await db.insert('onboarding_cases', {
    employee_id: null, candidate_name: 'Ishita Sen', email: 'ishita.sen@example.com', department: 'Engineering',
    designation: 'Backend Engineer', joining_date: day(21), manager_id: engManager.id, status: 'In Progress', progress: 0, created_by: hrHead.id,
  });
  await db.insertMany('onboarding_tasks', [
    { case_id: onboarding.id, employee_id: null, title: 'Collect signed offer and ID proof', category: 'Paperwork', assigned_to: hrExec.id, due_date: day(5), status: 'Completed', completed_at: iso(new Date()) },
    { case_id: onboarding.id, employee_id: null, title: 'Provision laptop and accounts', category: 'IT Provisioning', assigned_to: engManager.id, due_date: day(12), status: 'In Progress' },
    { case_id: onboarding.id, employee_id: null, title: 'Induction with Engineering team', category: 'Induction', assigned_to: engManager.id, due_date: day(21), status: 'Pending' },
    { case_id: onboarding.id, employee_id: null, title: 'Security and compliance training', category: 'Training', assigned_to: hrExec.id, due_date: day(28), status: 'Pending' },
  ]);
  await db.insertMany('onboarding_documents', [
    { case_id: onboarding.id, employee_id: null, document_type: 'Handbook', file_name: 'employee-handbook.pdf', status: 'Pending' },
    { case_id: onboarding.id, employee_id: null, document_type: 'NDA', file_name: 'nda.pdf', status: 'Pending' },
  ]);

  // Recruitment
  const reqSales = await db.insert('job_requisitions', {
    title: 'Sales Executive', department: 'Sales', position_count: 2, employment_type: 'Full Time', budget: 1500000,
    description: 'Own mid-market accounts in the western region.', status: 'Pending Manager', requester_id: hrHead.id,
  });
  const reqEngineering = await db.insert('job_requisitions', {
    title: 'Backend Engineer', department: 'Engineering', position_count: 1, employment_type: 'Full Time', budget: 2200000,
    description: 'Build and operate Node.js services on PostgreSQL.', status: 'Approved', requester_id: hrHead.id, approved_at: iso(new Date()),
  });
  await db.insertMany('requisition_approvals', [
    { requisition_id: reqEngineering.id, approver_id: engManager.id, step: 'Manager', status: 'Approved', is_escalation: false, is_self_approval: false },
    { requisition_id: reqEngineering.id, approver_id: ceo.id, step: 'Admin', status: 'Approved', is_escalation: false, is_self_approval: false },
  ]);
  await db.insert('job_requisitions', {
    title: 'Marketing Associate', department: 'Marketing', position_count: 1, employment_type: 'Full Time', budget: 900000,
    description: 'Support campaign execution and content operations.', status: 'Pending Manager', requester_id: hrHead.id,
  });
  await db.insert('job_openings', { requisition_id: reqEngineering.id, title: 'Backend Engineer', department: 'Engineering', location: 'Bengaluru (Hybrid)', employment_type: 'Full Time', status: 'Open', posted_at: iso(new Date()), created_by: hrHead.id });
  const candidate = await db.insert('candidates', {
    requisition_id: reqEngineering.id, full_name: 'Sanya Malhotra', email: 'sanya.malhotra@example.com', phone: '+91 99000 11111',
    stage: 'Interview', status: 'Active', source: 'Referral', created_by: hrHead.id,
  });
  await db.insert('interviews', {
    candidate_id: candidate.id, interviewer_id: engManager.id, scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    mode: 'Video', location: 'Google Meet', status: 'Scheduled', created_by: hrHead.id,
  });
  await db.insert('offers', {
    candidate_id: candidate.id, designation: 'Backend Engineer', salary: 1900000, currency: 'INR', joining_date: day(35),
    status: 'Draft', token: null, expires_at: null, created_by: hrHead.id,
  });

  // Performance
  const cycle = await db.insert('review_cycles', { name: `FY ${currentYear()} Annual Review`, period_start: `${currentYear()}-04-01`, period_end: `${currentYear() + 1}-03-31`, status: 'Active', created_by: hrHead.id });
  await db.insertMany('goals', [
    { employee_id: aarav.id, cycle_id: cycle.id, title: 'Lead platform modernization', description: 'Deliver the modular service architecture.', target: 'Production cutover by Q3', progress: 65, weightage: 40, status: 'In Progress', manager_id: engManager.id, created_by: aarav.id },
    { employee_id: aarav.id, cycle_id: cycle.id, title: 'Mentor two junior engineers', description: 'Structured mentoring with monthly checkpoints.', target: 'Both mentees ship independently', progress: 50, weightage: 20, status: 'In Progress', manager_id: engManager.id, created_by: aarav.id },
    { employee_id: diya.id, cycle_id: cycle.id, title: 'Automate regression suite', description: 'Reduce manual regression effort.', target: '80% automated coverage', progress: 30, weightage: 35, status: 'In Progress', manager_id: engManager.id, created_by: diya.id },
    { employee_id: kabir.id, cycle_id: cycle.id, title: 'Close INR 1.2 Cr new business', description: 'Build a qualified enterprise pipeline.', target: 'INR 1.2 Cr closed revenue', progress: 40, weightage: 50, status: 'In Progress', manager_id: salesManager.id, created_by: salesManager.id },
  ]);
  await db.insertMany('performance_reviews', [
    { employee_id: aarav.id, cycle_id: cycle.id, reviewer_id: engManager.id, rating: 4, strengths: 'Technical depth, ownership and delivery focus.', improvements: 'Delegate more and document architectural decisions.', comments: 'Strong year; ready for broader scope.', status: 'Submitted', submitted_at: iso(new Date()) },
    { employee_id: diya.id, cycle_id: cycle.id, reviewer_id: engManager.id, rating: null, strengths: '', improvements: '', comments: '', status: 'Draft' },
  ]);
  await db.insert('feedback', { employee_id: aarav.id, from_employee_id: engManager.id, type: 'Praise', message: 'Great job leading the migration without disrupting delivery.', visibility: 'Manager and HR' });

  // Helpdesk
  const catIT = await db.insert('ticket_categories', { name: 'IT Support', department: 'Engineering', sla_hours: 8, default_assignee_id: hrExec.id, active: true });
  const catPayroll = await db.insert('ticket_categories', { name: 'Payroll Query', department: 'HR', sla_hours: 24, default_assignee_id: hrExec.id, active: true });
  const catHR = await db.insert('ticket_categories', { name: 'HR Policy', department: 'HR', sla_hours: 48, default_assignee_id: hrHead.id, active: true });
  const catFacilities = await db.insert('ticket_categories', { name: 'Facilities', department: 'Operations', sla_hours: 12, active: true });
  const ticket1 = await db.insert('tickets', {
    ticket_no: `TKT-${currentYear()}-0001`, employee_id: aarav.id, category_id: catIT.id, subject: 'Laptop battery drains quickly',
    description: 'The battery drops from 100% to 20% in under two hours.', priority: 'Medium', status: 'In Progress',
    assigned_to: hrExec.id, sla_due_at: new Date(Date.now() + 4 * 3600000).toISOString(), created_at: iso(new Date(Date.now() - 2 * 86400000)),
  });
  const ticket2 = await db.insert('tickets', {
    ticket_no: `TKT-${currentYear()}-0002`, employee_id: diya.id, category_id: catPayroll.id, subject: 'Payslip deduction query',
    description: 'Please explain the professional tax deduction on my last payslip.', priority: 'Low', status: 'Closed',
    assigned_to: hrExec.id, sla_due_at: new Date(Date.now() - 3 * 86400000).toISOString(), resolved_at: iso(new Date(Date.now() - 4 * 86400000)),
    csat_rating: 5, csat_comment: 'Clear and quick response.', csat_at: iso(new Date(Date.now() - 3 * 86400000)),
  });
  await db.insert('tickets', {
    ticket_no: `TKT-${currentYear()}-0003`, employee_id: kabir.id, category_id: catFacilities.id, subject: 'Meeting room projector not working',
    description: 'Projector in room 4B shows no signal.', priority: 'High', status: 'Open', assigned_to: null,
    sla_due_at: new Date(Date.now() + 6 * 3600000).toISOString(),
  });
  await db.insertMany('ticket_comments', [
    { ticket_id: ticket1.id, author_id: hrExec.id, message: 'We have raised a replacement request with the vendor.', is_internal: false },
    { ticket_id: ticket1.id, author_id: aarav.id, message: 'Thanks, please share an ETA.', is_internal: false },
    { ticket_id: ticket2.id, author_id: hrExec.id, message: 'Professional tax is a statutory state deduction. Detailed breakdown sent by email.', is_internal: false },
  ]);
  const article1 = await db.insert('kb_articles', {
    title: 'How to submit a reimbursement claim', category_id: catPayroll.id, department: 'HR', status: 'Published',
    content: 'Open Compensation â†’ Reimbursements, choose a category, enter the amount and attach supporting details. Your reporting manager reviews the claim first, followed by HR. Approved claims are included in the next payroll run.',
    author_id: hrExec.id, published_at: iso(new Date()),
  });
  await db.insert('kb_articles', {
    title: 'Requesting an employment verification letter', category_id: catHR.id, department: 'HR', status: 'Published',
    content: 'Submit a document request from Helpdesk â†’ Documents. HR issues the letter after verification; it then appears in your document list and can be downloaded securely.',
    author_id: hrHead.id, published_at: iso(new Date()),
  });
  await db.insert('kb_articles', {
    title: 'VPN setup guide (draft)', category_id: catIT.id, department: 'Engineering', status: 'Draft',
    content: 'Draft instructions for configuring the corporate VPN on managed laptops. Pending review by IT.',
    author_id: hrExec.id,
  });
  await db.insert('kb_votes', { article_id: article1.id, employee_id: aarav.id, vote: 'Helpful' });
  await db.insert('document_requests', { employee_id: aarav.id, document_type: 'Salary Certificate', reason: 'Bank loan application', status: 'Pending' });

  // Offboarding (in clearance stage; employee record preserved)
  const offboarding = await db.insert('offboarding_cases', {
    employee_id: ananya.id, resignation_date: day(-20), last_working_date: day(10), reason: 'Pursuing higher education',
    status: 'Clearance', knowledge_transfer_status: 'Completed', exit_interview_date: day(-5),
    exit_interview_notes: 'Positive experience; suggested clearer marketing career paths.', final_settlement_amount: null,
    settlement_status: 'Pending', created_by: hrHead.id,
  });
  await db.insertMany('offboarding_clearances', [
    { case_id: offboarding.id, department: 'IT', status: 'Approved', approved_by: hrExec.id, approved_at: iso(new Date()), notes: 'Laptop and access revoked.' },
    { case_id: offboarding.id, department: 'Finance', status: 'Pending' },
    { case_id: offboarding.id, department: 'Manager', status: 'Pending' },
  ]);

  // Engagement
  const pulseSurvey = await db.insert('engagement_surveys', {
    title: 'Q1 Employee Engagement Pulse',
    description: 'Quarterly engagement and wellbeing check.',
    status: 'Active',
    start_date: day(-14),
    end_date: day(14),
    created_by: hrHead.id,
  });
  const q1 = await db.insert('engagement_survey_questions', {
    survey_id: pulseSurvey.id,
    question_text: 'How satisfied are you with your current role?',
    question_type: 'Rating',
    sort_order: 1,
  });
  await db.insert('engagement_survey_questions', {
    survey_id: pulseSurvey.id,
    question_text: 'What would improve your day-to-day experience?',
    question_type: 'Text',
    sort_order: 2,
  });
  for (const emp of [aarav, diya, kabir, hrExec]) {
    await db.insert('engagement_survey_assignments', { survey_id: pulseSurvey.id, employee_id: emp.id, status: emp.id === aarav.id ? 'Completed' : 'Pending', completed_at: emp.id === aarav.id ? iso(new Date()) : null });
  }
  const aaravAssignment = await db.select('engagement_survey_assignments', { where: { survey_id: pulseSurvey.id, employee_id: aarav.id }, limit: 1 });
  if (aaravAssignment.length) {
    await db.insert('engagement_survey_responses', { assignment_id: aaravAssignment[0].id, question_id: q1.id, answer_rating: 4 });
  }
  await db.insert('engagement_feedback', { employee_id: diya.id, category: 'Workplace', message: 'Would appreciate more quiet focus rooms.', status: 'Submitted' });
  await db.insert('engagement_wellness_checkins', { employee_id: aarav.id, mood_score: 4, stress_level: 2, notes: 'Good sprint, manageable load.' });
  await db.insert('engagement_recognition', { employee_id: aarav.id, points: 100, badge: 'Team Player', reason: 'Cross-team collaboration on release.', awarded_by: hrHead.id, awarded_at: iso(new Date()) });
  const pulse = await db.insert('engagement_pulse_polls', { question: 'How is hybrid work balance this week?', status: 'Active', created_by: hrHead.id });
  await db.insert('engagement_pulse_responses', { poll_id: pulse.id, employee_id: aarav.id, response: 'Working well â€” 2 days office is enough.' });

  // Employee Relations
  await db.insert('er_cases', {
    case_no: `ER-${new Date().getUTCFullYear()}-0001`,
    employee_id: kabir.id,
    subject: 'Clarification on sales incentive policy',
    description: 'Requesting clarification on Q4 incentive thresholds communicated in the town hall.',
    category: 'Policy Deviation',
    status: 'Investigation',
    priority: 'Medium',
    assigned_to: hrExec.id,
    investigation_notes: 'HR reviewing policy document version with Finance.',
  });

  // LMS
  const courseSecurity = await db.insert('lms_courses', {
    title: 'Information Security Essentials',
    description: 'Mandatory security awareness for all staff.',
    duration_hours: 2,
    category: 'Compliance',
    status: 'Published',
    content: 'Covers phishing, passwords, device hygiene and incident reporting.',
    created_by: hrHead.id,
    published_at: iso(new Date()),
  });
  const courseLeadership = await db.insert('lms_courses', {
    title: 'People Leadership Foundations',
    description: 'Core skills for new and aspiring managers.',
    duration_hours: 4,
    category: 'Leadership',
    status: 'Published',
    content: 'Feedback, coaching and performance conversations.',
    created_by: hrHead.id,
    published_at: iso(new Date()),
  });
  await db.insertMany('lms_course_assignments', [
    { course_id: courseSecurity.id, employee_id: aarav.id, status: 'In Progress', progress: 45, due_date: day(30), assigned_by: hrHead.id },
    { course_id: courseSecurity.id, employee_id: diya.id, status: 'Assigned', progress: 0, due_date: day(30), assigned_by: hrHead.id },
    { course_id: courseLeadership.id, employee_id: engManager.id, status: 'Completed', progress: 100, completed_at: iso(new Date()), assigned_by: hrHead.id },
  ]);
  const assessment = await db.insert('lms_assessments', { course_id: courseSecurity.id, title: 'Security quiz', pass_score: 70 });
  await db.insert('lms_assessment_questions', {
    assessment_id: assessment.id,
    question_text: 'Who should you report suspected phishing to?',
    correct_answer: 'IT Security',
    options: ['IT Security', 'Anyone', 'Ignore it', 'Social media'],
    sort_order: 1,
  });
  await db.insert('lms_certificates', { course_id: courseSecurity.id, name: 'Security Awareness Certificate', valid_months: 12 });
  await db.insert('lms_announcements', {
    title: 'New compliance courses published',
    body: 'Complete Information Security Essentials before the month end.',
    status: 'Published',
    published_at: iso(new Date()),
    created_by: hrHead.id,
  });

  // Audit trail sample
  await db.insertMany('audit_logs', [
    { actor_id: hrHead.id, action: 'PAYROLL_DISBURSED', entity_type: 'payroll_run', entity_id: run.id, details: { period }, ip_address: '127.0.0.1' },
    { actor_id: hrHead.id, action: 'REQUISITION_CREATED', entity_type: 'job_requisition', entity_id: reqSales.id, details: { title: 'Sales Executive' }, ip_address: '127.0.0.1' },
    { actor_id: ceo.id, action: 'REQUISITION_APPROVED', entity_type: 'job_requisition', entity_id: reqEngineering.id, details: {}, ip_address: '127.0.0.1' },
  ]);

  return {
    accounts: [
      { employee_id: 'EMP001', email: ceo.email, role: 'Admin', name: ceo.full_name },
      { employee_id: 'EMP002', email: hrHead.email, role: 'HR', name: hrHead.full_name },
      { employee_id: 'EMP004', email: engManager.email, role: 'Manager', name: engManager.full_name },
      { employee_id: 'EMP005', email: aarav.email, role: 'Employee', name: aarav.full_name },
    ],
    password: config.seedPassword,
  };
}
