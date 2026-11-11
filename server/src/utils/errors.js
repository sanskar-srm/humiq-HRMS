export class ApiError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Authentication required') =>
  new ApiError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'You are not authorized to perform this action') =>
  new ApiError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Resource not found') => new ApiError(404, message, 'NOT_FOUND');
export const conflict = (message) => new ApiError(409, message, 'CONFLICT');
