import { db } from '../../db/index.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const count = (table, where = {}) => db.count(table, where);

export const summary = async (user) => {
  const scope = await getAccessScope(user);
  const employeeWhere = scope.all ? { is_active: true } : { id: { in: scope.ids }, is_active: true };
  const scopeWhere = scope.all ? {} : { employee_id: { in: scope.ids } };

  const [totalEmployees, activeEmployees, newHires, openTickets, pendingLeaves, onboardingCases] =
    await Promise.all([
      count('employees'),
      count('employees', { is_active: true }),
      count('employees', { date_of_joining: { gte: monthStart() }, is_active: true }),
      count('tickets', { ...scopeWhere, status: { in: ['Open', 'In Progress', 'Pending'] } }),
      count('leave_requests', { ...scopeWhere, status: 'Pending' }),
      count('onboarding_cases', scope.all ? { status: { in: ['In Progress', 'Not Started'] } } : { ...scopeWhere, status: { in: ['In Progress', 'Not Started'] } }),
    ]);

  const employees = await db.select('employees', { where: employeeWhere, limit: 5000 });
  const departmentCounts = Object.entries(
    employees.reduce((acc, employee) => {
      acc[employee.department] = (acc[employee.department] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([department, value]) => ({ department, count: value }))
    .sort((a, b) => b.count - a.count);

  const attendanceToday = await db.select('attendance_records', {
    where: { ...scopeWhere, date: today() },
    limit: 5000,
  });

  const stats = [];
  const notifications = [];

  if (isHRAdmin(user)) {
    const [pendingRequisitions, payrollRuns, pendingReimbursements, reviews] = await Promise.all([
      count('job_requisitions', { status: { in: ['Pending Manager', 'Pending Admin'] } }),
      db.select('payroll_runs', { order: { column: 'created_at', ascending: false }, limit: 1 }),
      count('reimbursements', { status: { in: ['Submitted', 'Manager Approved'] } }),
      count('performance_reviews', { status: { in: ['Draft', 'In Progress'] } }),
    ]);
    stats.push(
      { key: 'employees', label: 'Active employees', value: activeEmployees, hint: `${totalEmployees} total records` },
      { key: 'new_hires', label: 'New hires this month', value: newHires, hint: 'Joined since month start' },
      { key: 'attendance', label: 'Clocked in today', value: attendanceToday.length, hint: `${activeEmployees} active employees` },
      { key: 'leaves', label: 'Pending leave requests', value: pendingLeaves, hint: 'Awaiting approval' },
      { key: 'tickets', label: 'Open helpdesk tickets', value: openTickets, hint: 'Across all employees' },
      { key: 'requisitions', label: 'Requisitions awaiting approval', value: pendingRequisitions, hint: 'Manager or Admin step' },
      { key: 'onboarding', label: 'Onboarding in progress', value: onboardingCases, hint: 'Active cases' },
      { key: 'payroll', label: 'Latest payroll run', value: payrollRuns[0]?.period ?? 'None', hint: payrollRuns[0]?.status ?? 'No runs yet' },
      { key: 'reimbursements', label: 'Reimbursements to review', value: pendingReimbursements, hint: 'Manager or HR step' },
      { key: 'reviews', label: 'Reviews in progress', value: reviews, hint: 'Open appraisal cycles' },
    );
    if (pendingRequisitions) notifications.push({ type: 'recruitment', message: `${pendingRequisitions} requisition(s) awaiting approval`, to: '/recruitment' });
    if (pendingLeaves) notifications.push({ type: 'attendance', message: `${pendingLeaves} leave request(s) awaiting approval`, to: '/attendance' });
    if (pendingReimbursements) notifications.push({ type: 'compensation', message: `${pendingReimbursements} reimbursement(s) awaiting review`, to: '/compensation' });
  } else if (isManager(user)) {
    const team = await getDirectReports(user.id);
    const teamIds = team.map((member) => member.id);
    const [teamGoals, teamReviews] = await Promise.all([
      count('goals', { employee_id: { in: teamIds }, status: { in: ['Not Started', 'In Progress'] } }),
      count('performance_reviews', { employee_id: { in: teamIds }, status: { in: ['Draft', 'In Progress'] } }),
    ]);
    stats.push(
      { key: 'team', label: 'Direct reports', value: team.length, hint: `${activeEmployees} people in your scope` },
      { key: 'attendance', label: 'Team clocked in today', value: attendanceToday.filter((record) => record.employee_id !== user.id).length, hint: `Out of ${team.length}` },
      { key: 'leaves', label: 'Team leave requests', value: pendingLeaves, hint: 'Awaiting your decision' },
      { key: 'goals', label: 'Team goals active', value: teamGoals, hint: 'Not started or in progress' },
      { key: 'reviews', label: 'Team reviews open', value: teamReviews, hint: 'Draft or in progress' },
      { key: 'tickets', label: 'Team support tickets', value: openTickets, hint: 'Open or in progress' },
      { key: 'onboarding', label: 'Team onboarding', value: onboardingCases, hint: 'Active cases' },
    );
    if (pendingLeaves) notifications.push({ type: 'attendance', message: `${pendingLeaves} team leave request(s) need review`, to: '/attendance' });
    if (teamReviews) notifications.push({ type: 'performance', message: `${teamReviews} team review(s) in progress`, to: '/performance' });
  } else {
    const [payslips, goals, onboardingTasks, myTickets] = await Promise.all([
      db.select('payslips', { where: { employee_id: user.id }, order: { column: 'created_at', ascending: false }, limit: 1 }),
      db.select('goals', { where: { employee_id: user.id, status: { in: ['Not Started', 'In Progress'] } }, limit: 50 }),
      db.select('onboarding_tasks', { where: { employee_id: user.id, status: { ne: 'Completed' } }, limit: 50 }),
      count('tickets', { employee_id: user.id, status: { in: ['Open', 'In Progress', 'Pending'] } }),
    ]);
    const todayRecord = attendanceToday.find((record) => record.employee_id === user.id);
    stats.push(
      { key: 'attendance', label: 'Today', value: todayRecord?.clock_in ? 'Clocked in' : 'Not clocked in', hint: todayRecord?.clock_in ? `Since ${todayRecord.clock_in}` : 'Use clock-in to start your day' },
      { key: 'payslip', label: 'Latest payslip', value: payslips[0]?.net_pay ? `₹${Number(payslips[0].net_pay).toLocaleString('en-IN')}` : 'None', hint: payslips[0]?.period ?? 'No payslips yet' },
      { key: 'goals', label: 'Active goals', value: goals.length, hint: 'Not started or in progress' },
      { key: 'onboarding', label: 'Onboarding tasks', value: onboardingTasks.length, hint: 'Tasks still open' },
      { key: 'tickets', label: 'My open tickets', value: myTickets, hint: 'Support requests' },
      { key: 'leaves', label: 'My pending leave', value: pendingLeaves, hint: 'Awaiting approval' },
    );
    if (onboardingTasks.length) notifications.push({ type: 'onboarding', message: `${onboardingTasks.length} onboarding task(s) remaining`, to: '/onboarding' });
    if (myTickets) notifications.push({ type: 'helpdesk', message: `${myTickets} support ticket(s) still open`, to: '/helpdesk' });
  }

  const recentActivity = isHRAdmin(user)
    ? await db.select('audit_logs', { order: { column: 'created_at', ascending: false }, limit: 8 })
    : [];

  return {
    role: user.role,
    stats,
    departments: departmentCounts,
    attendance_today: attendanceToday.length,
    recent_activity: recentActivity,
    notifications,
    scope: { all: scope.all, employee_count: employees.length },
  };
};
