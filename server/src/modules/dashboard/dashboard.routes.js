import { Router } from 'express';
import { asyncHandler } from '../../utils/http.js';
import { ok } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', authenticate, asyncHandler(async (req, res) =>
  ok(res, await service.summary(req.user), 'Dashboard summary retrieved successfully'),
));
