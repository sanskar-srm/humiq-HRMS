import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toISOString().slice(11, 16);
const monthRange = (month) => {
  const base = month && /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
  const [year, monthNumber] = base.split('-').map(Number);
  const start = `${base}-01`;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start, end, month: base };
};

const enrich = async (rows, employeeField = 'employee_id') => {
  const ids = [...new Set(rows.map((row) => row[employeeField]).filter(Boolean))];
  const employees = ids.length ? await db.select('employees', { where: { id: { in: ids } }, limit: ids.length }) : [];
  const map = new Map(employees.map((employee) => [employee.id, employee]));
  return rows.map((row) => {
    const employee = map.get(row[employeeField]);
    return {
      ...row,
      employee_name: employee?.full_name ?? 'Unknown employee',
      employee_code: employee?.employee_code ?? '',
      department: employee?.department ?? '',
    };
  });
};

const ensureScope = async (user, employeeId) => {
  const scope = await getAccessScope(user);
  if (!scope.all && !scope.ids.includes(employeeId)) throw forbidden('You do not have access to this employee’s attendance');
};

export const listRecords = async (user, query) => {
  const { start, end } = monthRange(query.month);
  const scope = await getAccessScope(user);
  const where = {
    date: { gte: query.from || start, lte: query.to || end },
  };
  if (query.employee_id) {
    await ensureScope(user, query.employee_id);
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  const rows = await db.select('attendance_records', { where, order: { column: 'date', ascending: false }, limit: 2000 });
  return enrich(rows);
};

export const todayRecord = async (user) => {
  const [record] = await db.select('attendance_records', { where: { employee_id: user.id, date: today() }, limit: 1 });
  return record ?? null;
};

export const clockIn = async (user, req) => {
  const existing = await todayRecord(user);
  if (existing?.clock_in) throw conflict('You have already clocked in today');
  const time = nowTime();
  let record;
  if (existing) {
    [record] = await db.update('attendance_records', { id: existing.id }, { clock_in: time, status: 'Present' });
  } else {
    record = await db.insert('attendance_records', {
      employee_id: user.id,
      date: today(),
      clock_in: time,
      clock_out: null,
      status: 'Present',
      overtime_hours: 0,
      source: 'self',
    });
  }
  await recordAudit({ actorId: user.id, action: 'ATTENDANCE_CLOCK_IN', entityType: 'attendance_record', entityId: record.id, details: { time }, req });
  return record;
};

export const clockOut = async (user, req) => {
  const record = await todayRecord(user);
  if (!record?.clock_in) throw badRequest('You have not clocked in today');
  if (record.clock_out) throw conflict('You have already clocked out today');
  const time = nowTime();
  const [startHour, startMinute] = record.clock_in.split(':').map(Number);
  const [endHour, endMinute] = time.split(':').map(Number);
  const minutes = Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
  const overtime = Math.max(0, Math.round(((minutes - 9 * 60) / 60) * 100) / 100);
  const [updated] = await db.update('attendance_records', { id: record.id }, { clock_out: time, overtime_hours: overtime });
  await recordAudit({ actorId: user.id, action: 'ATTENDANCE_CLOCK_OUT', entityType: 'attendance_record', entityId: record.id, details: { time, overtime }, req });
  return updated;
};

export const createRecord = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can add manual attendance');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const existing = await db.select('attendance_records', { where: { employee_id: payload.employee_id, date: payload.date }, limit: 1 });
  if (existing.length) throw conflict('An attendance record already exists for this employee and date');
  const record = await db.insert('attendance_records', { ...payload, source: 'manual', created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'ATTENDANCE_RECORD_CREATED', entityType: 'attendance_record', entityId: record.id, details: payload, req });
  return record;
};

export const updateRecord = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can update attendance records');
  const record = await db.findById('attendance_records', id);
  if (!record) throw notFound('Attendance record not found');
  const [updated] = await db.update('attendance_records', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'ATTENDANCE_RECORD_UPDATED', entityType: 'attendance_record', entityId: id, details: payload, req });
  return updated;
};

const daysBetween = (start, end) => {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.floor((endDate - startDate) / 86400000) + 1;
};

export const listLeaves = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    await ensureScope(user, query.employee_id);
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  if (query.status) where.status = query.status;
  if (query.leave_type) where.leave_type = query.leave_type;
  const rows = await db.select('leave_requests', { where, order: { column: 'created_at', ascending: false }, limit: 1000 });
  return enrich(rows);
};

export const createLeave = async (user, payload, req) => {
  const employeeId = payload.employee_id ?? user.id;
  if (employeeId !== user.id && !isHRAdmin(user)) {
    throw forbidden('You can only submit leave for yourself');
  }
  await ensureScope(user, employeeId);
  if (payload.end_date < payload.start_date) throw badRequest('End date must be on or after the start date');
  const days = daysBetween(payload.start_date, payload.end_date);
  if (days <= 0 || days > 365) throw badRequest('Invalid leave duration');
  const overlap = await db.select('leave_requests', {
    where: {
      employee_id: employeeId,
      status: { in: ['Pending', 'Approved'] },
      start_date: { lte: payload.end_date },
      end_date: { gte: payload.start_date },
    },
    limit: 1,
  });
  if (overlap.length) throw conflict('This leave request overlaps an existing request');
  const leave = await db.insert('leave_requests', {
    employee_id: employeeId,
    leave_type: payload.leave_type,
    start_date: payload.start_date,
    end_date: payload.end_date,
    days,
    reason: payload.reason,
    status: 'Pending',
    applied_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'LEAVE_REQUESTED', entityType: 'leave_request', entityId: leave.id, details: { employee_id: employeeId, days }, req });
  const [enriched] = await enrich([leave]);
  return enriched;
};

export const decideLeave = async (user, id, decision, note, req) => {
  const leave = await db.findById('leave_requests', id);
  if (!leave) throw notFound('Leave request not found');
  if (leave.status !== 'Pending') throw conflict('This leave request has already been decided');
  if (leave.employee_id === user.id) throw forbidden('You cannot approve or reject your own leave request');

  if (!isHRAdmin(user)) {
    if (!isManager(user)) throw forbidden('Only Admin, HR or the reporting manager can decide leave requests');
    const employee = await db.findById('employees', leave.employee_id);
    if (!employee || employee.reports_to !== user.id) throw forbidden('This employee is not in your reporting team');
  }

  const [updated] = await db.update('leave_requests', { id }, {
    status: decision,
    decision_note: note ?? null,
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  });
  if (decision === 'Approved') {
    const existing = await db.select('attendance_records', {
      where: { employee_id: leave.employee_id, date: { gte: leave.start_date, lte: leave.end_date } },
      limit: 1000,
    });
    const existingDates = new Set(existing.map((record) => record.date));
    const rows = [];
    for (let offset = 0; offset < leave.days; offset += 1) {
      const date = new Date(new Date(`${leave.start_date}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
      if (!existingDates.has(date)) {
        rows.push({ employee_id: leave.employee_id, date, status: 'Leave', leave_type: leave.leave_type, source: 'leave' });
      }
    }
    if (rows.length) await db.insertMany('attendance_records', rows);
  }
  await recordAudit({ actorId: user.id, action: `LEAVE_${decision.toUpperCase()}`, entityType: 'leave_request', entityId: id, details: { note }, req });
  const [enriched] = await enrich([updated]);
  return enriched;
};

export const cancelLeave = async (user, id, req) => {
  const leave = await db.findById('leave_requests', id);
  if (!leave) throw notFound('Leave request not found');
  if (leave.employee_id !== user.id && !isHRAdmin(user)) throw forbidden('You cannot cancel this leave request');
  if (leave.status !== 'Pending') throw conflict('Only pending leave requests can be cancelled');
  await db.update('leave_requests', { id }, { status: 'Cancelled', cancelled_at: new Date().toISOString() });
  await recordAudit({ actorId: user.id, action: 'LEAVE_CANCELLED', entityType: 'leave_request', entityId: id, req });
};

export const listShifts = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    await ensureScope(user, query.employee_id);
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  const rows = await db.select('shifts', { where, order: { column: 'date', ascending: true }, limit: 1000 });
  return enrich(rows);
};

export const createShift = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can manage shift schedules');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const shift = await db.insert('shifts', { ...payload, created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'SHIFT_CREATED', entityType: 'shift', entityId: shift.id, details: payload, req });
  return shift;
};

export const deleteShift = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can manage shift schedules');
  const removed = await db.remove('shifts', { id });
  if (!removed) throw notFound('Shift not found');
  await recordAudit({ actorId: user.id, action: 'SHIFT_DELETED', entityType: 'shift', entityId: id, req });
};

export const listHolidays = async () =>
  db.select('holidays', { order: { column: 'date', ascending: true }, limit: 500 });

export const createHoliday = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can manage the holiday calendar');
  const duplicate = await db.select('holidays', { where: { date: payload.date }, limit: 1 });
  if (duplicate.length) throw conflict('A holiday already exists on this date');
  const holiday = await db.insert('holidays', { ...payload, created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'HOLIDAY_CREATED', entityType: 'holiday', entityId: holiday.id, details: payload, req });
  return holiday;
};

export const deleteHoliday = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can manage the holiday calendar');
  const removed = await db.remove('holidays', { id });
  if (!removed) throw notFound('Holiday not found');
  await recordAudit({ actorId: user.id, action: 'HOLIDAY_DELETED', entityType: 'holiday', entityId: id, req });
};

export const summary = async (user, month) => {
  const { start, end, month: period } = monthRange(month);
  // The overview is personal for every role. Team and organisation records are
  // exposed through the separately scoped Records and Leave tabs.
  const records = await db.select('attendance_records', {
    where: { employee_id: user.id, date: { gte: start, lte: end } },
    limit: 1000,
  });
  const leaves = await db.select('leave_requests', {
    where: {
      employee_id: user.id,
      status: 'Approved',
      start_date: { lte: end },
      end_date: { gte: start },
    },
    limit: 200,
  });
  const present = records.filter((record) => record.status === 'Present' || record.status === 'Late' || record.status === 'Work From Home').length;
  const absent = records.filter((record) => record.status === 'Absent').length;
  const overtime = records.reduce((sum, record) => sum + Number(record.overtime_hours ?? 0), 0);
  return {
    period,
    present,
    absent,
    late: records.filter((record) => record.status === 'Late').length,
    leave_days: leaves.reduce((sum, leave) => sum + Number(leave.days ?? 0), 0),
    overtime_hours: Math.round(overtime * 100) / 100,
    records: records.length,
    employees_in_scope: 1,
  };
};

export const calendar = async (user, month) => {
  const { start, end, month: period } = monthRange(month);
  const [records, leaves, holidays] = await Promise.all([
    db.select('attendance_records', {
      where: { employee_id: user.id, date: { gte: start, lte: end } },
      limit: 1000,
    }),
    db.select('leave_requests', {
      where: { employee_id: user.id, status: 'Approved', start_date: { lte: end }, end_date: { gte: start } },
      limit: 200,
    }),
    db.select('holidays', { where: { date: { gte: start, lte: end } }, limit: 200 }),
  ]);
  return { period, records, leaves, holidays };
};

export const teamLeaveRequests = async (user) => {
  if (!isManager(user) && !isHRAdmin(user)) throw forbidden('Only managers or HR can view team leave requests');
  if (isHRAdmin(user)) return enrich(await db.select('leave_requests', { where: { status: 'Pending' }, order: { column: 'created_at', ascending: true }, limit: 500 }));
  const reports = await getDirectReports(user.id);
  if (!reports.length) return [];
  return enrich(await db.select('leave_requests', {
    where: { employee_id: { in: reports.map((report) => report.id) }, status: 'Pending' },
    order: { column: 'created_at', ascending: true },
    limit: 500,
  }));
};
