import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import { db } from '../db/index.js';
import { unauthorized } from '../utils/errors.js';

export const authenticate = async (req, _res, next) => {
  try {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized('Missing or invalid access token');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Your session is invalid or has expired');
    }

    const employee = await db.findById('employees', payload.sub);
    if (!employee || employee.is_active === false) {
      throw unauthorized('Your account is not active');
    }

    req.user = {
      id: employee.id,
      employee_code: employee.employee_code,
      full_name: employee.full_name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      designation: employee.designation,
      employment_level: employee.employment_level,
      reports_to: employee.reports_to ?? null,
    };
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
};

export const signToken = (employee) =>
  jwt.sign(
    {
      sub: employee.id,
      employee_code: employee.employee_code,
      role: employee.role,
      department: employee.department,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'hrms-api' },
  );
