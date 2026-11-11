import { forbidden } from '../utils/errors.js';
import { ROLES } from '../utils/roles.js';

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(forbidden('Authentication is required'));
  if (!roles.includes(req.user.role)) {
    return next(forbidden('You are not authorized to perform this action'));
  }
  return next();
};

export const requireHRAdmin = authorize(ROLES.ADMIN, ROLES.HR);
export const requireAdmin = authorize(ROLES.ADMIN);
export const requireStaff = authorize(ROLES.ADMIN, ROLES.HR, ROLES.MANAGER);
