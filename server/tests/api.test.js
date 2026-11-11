import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 5700 + Math.floor(Math.random() * 200);
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}/api/v1`;
const dataFile = path.join(os.tmpdir(), `hrms-api-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);

let child;
let logs = '';
const sessions = {};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(urlPath, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function loginStaff(employeeId, password = 'ChangeMe123!') {
  const response = await request('/auth/login', { method: 'POST', body: { employee_id: employeeId, password } });
  assert.equal(response.status, 200, `staff login failed for ${employeeId}: ${JSON.stringify(response.body)}`);
  return response.body.data;
}

async function loginEmployee(email, password = 'ChangeMe123!') {
  const response = await request('/employee/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, `employee login failed for ${email}: ${JSON.stringify(response.body)}`);
  return response.body.data;
}

before(async () => {
  child = spawn(process.execPath, ['src/server.js'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_MODE: 'memory',
      DATABASE_URL: '',
      DIRECT_URL: '',
      PORT: String(port),
      JWT_SECRET: 'test-only-secret-that-is-long-enough-for-jwt',
      SEED_PASSWORD: 'ChangeMe123!',
      AUTO_SEED: 'true',
      MEMORY_DATA_FILE: dataFile,
      CLIENT_URL: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) break;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }

  try {
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200, `test server did not start:\n${logs}`);
  } catch (error) {
    throw new Error(`test server did not start:\n${logs}\n${error.message}`);
  }

  sessions.admin = await loginStaff('EMP001');
  sessions.hr = await loginStaff('EMP002');
  sessions.manager = await loginStaff('EMP004');
  sessions.employee = await loginStaff('EMP005');
  sessions.employeePortal = await loginEmployee('emp1@hrms.local');
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await delay(500);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  fs.rmSync(dataFile, { force: true });
});

test('authentication rejects bad credentials and exposes role-appropriate scopes', async () => {
  const badLogin = await request('/auth/login', { method: 'POST', body: { employee_id: 'EMP001', password: 'wrong-password' } });
  assert.equal(badLogin.status, 401);

  const employeeDirectory = await request('/employees', { token: sessions.employee.token });
  assert.equal(employeeDirectory.status, 403);

  const employeeSummary = await request('/payroll/summary', { token: sessions.employee.token });
  assert.equal(employeeSummary.status, 200);
  assert.equal(employeeSummary.body.data.scope, 'self');

  const adminSummary = await request('/payroll/summary', { token: sessions.admin.token });
  assert.equal(adminSummary.status, 200);
  assert.equal(adminSummary.body.data.scope, 'organization');

  const managerSummary = await request('/payroll/summary', { token: sessions.manager.token });
  assert.equal(managerSummary.status, 200);
  assert.equal(managerSummary.body.data.scope, 'team');

  const managerRequisitions = await request('/recruitment/requisitions', { token: sessions.manager.token });
  assert.equal(managerRequisitions.status, 200);
  assert.ok(managerRequisitions.body.data.length > 0);
  assert.ok(managerRequisitions.body.data.every((row) => row.department === sessions.manager.user.department));

  const month = new Date().toISOString().slice(0, 7);
  const employeeAttendance = await request(`/attendance/summary?month=${month}`, { token: sessions.employee.token });
  const managerAttendance = await request(`/attendance/summary?month=${month}`, { token: sessions.manager.token });
  const adminAttendance = await request(`/attendance/summary?month=${month}`, { token: sessions.admin.token });
  assert.equal(employeeAttendance.status, 200);
  assert.equal(managerAttendance.status, 200);
  assert.equal(adminAttendance.status, 200);
  assert.equal(managerAttendance.body.data.employees_in_scope, 1);
  assert.equal(adminAttendance.body.data.employees_in_scope, 1);
  assert.equal(managerAttendance.body.data.present, employeeAttendance.body.data.present);
  assert.equal(adminAttendance.body.data.present, employeeAttendance.body.data.present);
});

test('employee scoping blocks cross-record access to people, tickets, payroll and offboarding', async () => {
  const directory = await request('/employees/options', { token: sessions.admin.token });
  assert.equal(directory.status, 200);
  const ananya = directory.body.data.find((row) => row.employee_code === 'EMP010');
  const diya = directory.body.data.find((row) => row.employee_code === 'EMP006');
  assert.ok(ananya && diya);

  const otherEmployee = await request(`/employees/${ananya.id}`, { token: sessions.employee.token });
  assert.equal(otherEmployee.status, 403);

  const managerOutsideTeam = await request(`/employees/${ananya.id}`, { token: sessions.manager.token });
  assert.equal(managerOutsideTeam.status, 403);

  const adminTickets = await request('/helpdesk/tickets', { token: sessions.admin.token });
  assert.equal(adminTickets.status, 200);
  const diyaTicket = adminTickets.body.data.find((ticket) => ticket.employee_id === diya.id);
  assert.ok(diyaTicket);
  const blockedTicket = await request(`/helpdesk/tickets/${diyaTicket.id}`, { token: sessions.employee.token });
  assert.equal(blockedTicket.status, 403);

  const employeeTickets = await request('/helpdesk/tickets', { token: sessions.employee.token });
  assert.equal(employeeTickets.status, 200);
  assert.ok(employeeTickets.body.data.every((ticket) => ticket.employee_id === sessions.employee.user.id));

  const adminPayslips = await request('/payroll/payslips', { token: sessions.admin.token });
  assert.equal(adminPayslips.status, 200);
  const diyaPayslip = adminPayslips.body.data.find((payslip) => payslip.employee_id === diya.id);
  assert.ok(diyaPayslip);
  const blockedPayslip = await request(`/payroll/payslips/${diyaPayslip.id}`, { token: sessions.employee.token });
  assert.equal(blockedPayslip.status, 403);

  const ownPayslip = adminPayslips.body.data.find((payslip) => payslip.employee_id === sessions.employee.user.id);
  assert.ok(ownPayslip);
  const ownPayslipResponse = await request(`/payroll/payslips/${ownPayslip.id}`, { token: sessions.employee.token });
  assert.equal(ownPayslipResponse.status, 200);

  const adminCases = await request('/offboarding/cases', { token: sessions.admin.token });
  assert.equal(adminCases.status, 200);
  const ananyaCase = adminCases.body.data.find((item) => item.employee_id === ananya.id);
  assert.ok(ananyaCase);
  const blockedCase = await request(`/offboarding/cases/${ananyaCase.id}`, { token: sessions.employee.token });
  assert.equal(blockedCase.status, 403);
});

test('recruitment enforces two-step approvals, manager eligibility and no HR approval', async () => {
  const requisitions = await request('/recruitment/requisitions', { token: sessions.admin.token });
  assert.equal(requisitions.status, 200);
  const salesRequisition = requisitions.body.data.find((row) => row.department === 'Sales' && row.status === 'Pending Manager');
  assert.ok(salesRequisition);

  const hrApproval = await request(`/recruitment/requisitions/${salesRequisition.id}/approve`, {
    method: 'POST',
    token: sessions.hr.token,
    body: { step: 'Manager', decision: 'Approved' },
  });
  assert.equal(hrApproval.status, 403);

  const wrongManager = await request(`/recruitment/requisitions/${salesRequisition.id}/approve`, {
    method: 'POST',
    token: sessions.manager.token,
    body: { step: 'Manager', decision: 'Approved' },
  });
  assert.equal(wrongManager.status, 403);

  const prematureAdmin = await request(`/recruitment/requisitions/${salesRequisition.id}/approve`, {
    method: 'POST',
    token: sessions.admin.token,
    body: { step: 'Manager', decision: 'Approved' },
  });
  assert.equal(prematureAdmin.status, 403);

  const created = await request('/recruitment/requisitions', {
    method: 'POST',
    token: sessions.hr.token,
    body: { title: 'Platform Engineer', department: 'Engineering', position_count: 1, budget: 1800000 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'Pending Manager');

  const managerApproved = await request(`/recruitment/requisitions/${created.body.data.id}/approve`, {
    method: 'POST',
    token: sessions.manager.token,
    body: { step: 'Manager', decision: 'Approved' },
  });
  assert.equal(managerApproved.status, 200);
  assert.equal(managerApproved.body.data.status, 'Pending Admin');

  const hrFinal = await request(`/recruitment/requisitions/${created.body.data.id}/approve`, {
    method: 'POST',
    token: sessions.hr.token,
    body: { step: 'Admin', decision: 'Approved' },
  });
  assert.equal(hrFinal.status, 403);

  const adminFinal = await request(`/recruitment/requisitions/${created.body.data.id}/approve`, {
    method: 'POST',
    token: sessions.admin.token,
    body: { step: 'Admin', decision: 'Approved' },
  });
  assert.equal(adminFinal.status, 200);
  assert.equal(adminFinal.body.data.status, 'Approved');
  assert.equal(adminFinal.body.data.approvals.length, 2);
});

test('public offer links can be issued and accepted without authentication', async () => {
  const offers = await request('/recruitment/offers', { token: sessions.admin.token });
  assert.equal(offers.status, 200);
  const draft = offers.body.data.find((offer) => offer.status === 'Draft');
  assert.ok(draft);

  const issued = await request(`/recruitment/offers/${draft.id}/issue`, { method: 'POST', token: sessions.admin.token });
  assert.equal(issued.status, 200);
  const token = issued.body.data.offer_link.split('/').pop();
  assert.ok(token);

  const publicOffer = await request(`/recruitment/public/offers/${token}`);
  assert.equal(publicOffer.status, 200);
  assert.equal(publicOffer.body.data.status, 'Issued');

  const accepted = await request(`/recruitment/public/offers/${token}/accept`, { method: 'POST' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, 'Accepted');

  const acceptedAgain = await request(`/recruitment/public/offers/${token}/accept`, { method: 'POST' });
  assert.equal(acceptedAgain.status, 409);
});

test('payroll lifecycle processes and disburses with restricted employee access', async () => {
  const period = '2030-01';
  const created = await request('/payroll/runs', { method: 'POST', token: sessions.admin.token, body: { period } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'Draft');

  const duplicate = await request('/payroll/runs', { method: 'POST', token: sessions.admin.token, body: { period } });
  assert.equal(duplicate.status, 409);

  const employeeProcess = await request(`/payroll/runs/${created.body.data.id}/process`, { method: 'POST', token: sessions.employee.token });
  assert.equal(employeeProcess.status, 403);

  const processed = await request(`/payroll/runs/${created.body.data.id}/process`, { method: 'POST', token: sessions.admin.token });
  assert.equal(processed.status, 200);
  assert.equal(processed.body.data.run.status, 'Processed');
  assert.ok(processed.body.data.run.employee_count > 0);
  assert.ok(Number(processed.body.data.run.total_net) > 0);

  const disbursed = await request(`/payroll/runs/${created.body.data.id}/disburse`, { method: 'POST', token: sessions.admin.token });
  assert.equal(disbursed.status, 200);
  assert.equal(disbursed.body.data.status, 'Disbursed');

  const employeePayslips = await request(`/payroll/payslips?period=${period}`, { token: sessions.employee.token });
  assert.equal(employeePayslips.status, 200);
  assert.ok(employeePayslips.body.data.length > 0);
  assert.ok(employeePayslips.body.data.every((payslip) => payslip.employee_id === sessions.employee.user.id));

  const ownPayslip = employeePayslips.body.data[0];
  const download = await request(`/payroll/payslips/${ownPayslip.id}/document`, { token: sessions.employee.token });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type') ?? '', /text\/html/);
  assert.match(String(download.body), /Payslip/);
});

test('offboarding completion preserves the employee record and updates alumni', async () => {
  const directory = await request('/employees/options', { token: sessions.hr.token });
  const rohan = directory.body.data.find((row) => row.employee_code === 'EMP009');
  assert.ok(rohan);

  const created = await request('/offboarding/cases', {
    method: 'POST',
    token: sessions.hr.token,
    body: { employee_id: rohan.id, resignation_date: '2030-02-01', last_working_date: '2030-02-28', reason: 'Test offboarding workflow' },
  });
  assert.equal(created.status, 201);
  const caseId = created.body.data.id;

  const detail = await request(`/offboarding/cases/${caseId}`, { token: sessions.hr.token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.clearances.length, 3);

  const prematureCompletion = await request(`/offboarding/cases/${caseId}/complete`, { method: 'POST', token: sessions.hr.token });
  assert.equal(prematureCompletion.status, 403);

  for (const clearance of detail.body.data.clearances) {
    const decided = await request(`/offboarding/cases/${caseId}/clearances/${clearance.id}`, {
      method: 'PATCH',
      token: sessions.hr.token,
      body: { status: 'Approved', notes: 'Cleared in automated API test' },
    });
    assert.equal(decided.status, 200);
  }

  const settlement = await request(`/offboarding/cases/${caseId}/settlement`, {
    method: 'POST',
    token: sessions.hr.token,
    body: { amount: 125000, status: 'Processed' },
  });
  assert.equal(settlement.status, 200);

  const document = await request(`/offboarding/cases/${caseId}/documents`, {
    method: 'POST',
    token: sessions.hr.token,
    body: { document_type: 'Experience Letter' },
  });
  assert.equal(document.status, 201);

  const completed = await request(`/offboarding/cases/${caseId}/complete`, { method: 'POST', token: sessions.hr.token });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.status, 'Completed');

  const employeeRecord = await request(`/employees/${rohan.id}`, { token: sessions.hr.token });
  assert.equal(employeeRecord.status, 200);
  assert.equal(employeeRecord.body.data.employment_status, 'Exited');
  assert.equal(employeeRecord.body.data.is_active, false);

  const alumni = await request('/offboarding/alumni', { token: sessions.hr.token });
  assert.equal(alumni.status, 200);
  assert.ok(alumni.body.data.some((item) => item.id === caseId));
});

test('helpdesk, knowledge base and performance permissions are enforced', async () => {
  const categories = await request('/helpdesk/categories', { token: sessions.employee.token });
  assert.equal(categories.status, 200);
  const category = categories.body.data.find((item) => item.active !== false);
  assert.ok(category);

  const ticket = await request('/helpdesk/tickets', {
    method: 'POST',
    token: sessions.employee.token,
    body: { category_id: category.id, subject: 'API test ticket', description: 'Created by the automated API test.', priority: 'Low' },
  });
  assert.equal(ticket.status, 201);
  assert.equal(ticket.body.data.employee_id, sessions.employee.user.id);

  const employeeUpdate = await request(`/helpdesk/tickets/${ticket.body.data.id}`, {
    method: 'PATCH',
    token: sessions.employee.token,
    body: { status: 'Resolved' },
  });
  assert.equal(employeeUpdate.status, 403);

  const employeeCategory = await request('/helpdesk/categories', {
    method: 'POST',
    token: sessions.employee.token,
    body: { name: 'Unauthorised', department: 'HR', sla_hours: 24 },
  });
  assert.equal(employeeCategory.status, 403);

  const publishedArticles = await request('/helpdesk/kb/articles', { token: sessions.employee.token });
  assert.equal(publishedArticles.status, 200);
  assert.ok(publishedArticles.body.data.length > 0);
  assert.ok(publishedArticles.body.data.every((article) => article.status === 'Published'));

  const draft = await request('/helpdesk/kb/articles', {
    method: 'POST',
    token: sessions.hr.token,
    body: { title: 'API test article', content: 'This article is created by the automated API test and should remain a draft.', category_id: category.id },
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.status, 'Draft');

  const employeeArticle = await request('/helpdesk/kb/articles', {
    method: 'POST',
    token: sessions.employee.token,
    body: { title: 'Unauthorised article', content: 'This should not be created.', category_id: category.id },
  });
  assert.equal(employeeArticle.status, 403);

  const goals = await request('/performance/goals', { token: sessions.employee.token });
  assert.equal(goals.status, 200);
  assert.ok(goals.body.data.length > 0);
  assert.ok(goals.body.data.every((goal) => goal.employee_id === sessions.employee.user.id));

  const employeeReview = await request('/performance/reviews', {
    method: 'POST',
    token: sessions.employee.token,
    body: { employee_id: sessions.manager.user.id, cycle_id: '00000000-0000-0000-0000-000000000000' },
  });
  assert.equal(employeeReview.status, 403);

  const directory = await request('/employees/options', { token: sessions.admin.token });
  const diya = directory.body.data.find((row) => row.employee_code === 'EMP006');
  assert.ok(diya);
  const teamIds = new Set([sessions.manager.user.id, sessions.employee.user.id, diya.id]);
  const managerLeaves = await request('/attendance/leaves', { token: sessions.manager.token });
  assert.equal(managerLeaves.status, 200);
  assert.ok(managerLeaves.body.data.every((leave) => teamIds.has(leave.employee_id)));

  const pendingLeave = managerLeaves.body.data.find((leave) => leave.employee_id === sessions.employee.user.id && leave.status === 'Pending');
  assert.ok(pendingLeave);
  const employeeDecision = await request(`/attendance/leaves/${pendingLeave.id}/decision`, {
    method: 'PATCH',
    token: sessions.employee.token,
    body: { decision: 'Approved' },
  });
  assert.equal(employeeDecision.status, 403);

  const managerDecision = await request(`/attendance/leaves/${pendingLeave.id}/decision`, {
    method: 'PATCH',
    token: sessions.manager.token,
    body: { decision: 'Approved' },
  });
  assert.equal(managerDecision.status, 200);
});
