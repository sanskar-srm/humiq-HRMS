import { db } from '../db/index.js';
import { logger } from './logger.js';

export const recordAudit = async ({ actorId, action, entityType, entityId, details, req }) => {
  try {
    await db.insert('audit_logs', {
      actor_id: actorId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? {},
      ip_address: req?.ip ?? null,
      user_agent: req?.get?.('user-agent') ?? null,
    });
  } catch (error) {
    // Audit failures must never break the business operation, but must be visible.
    logger.error('Failed to record audit event', error, {
      action,
      entityType,
      entityId,
      actorId,
      requestId: req?.id,
    });
  }
};
