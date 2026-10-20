import { type CooperativeContext, hasAccess, requireAccess } from '../../access';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Management information: partners have no access by default (requirements/05). */
export const requireRead = (context: CooperativeContext) =>
  requireAccess(context.permissions, 'invoicing', 'read');
export const requireManage = (context: CooperativeContext) =>
  requireAccess(context.permissions, 'invoicing', 'manage');
export const canManage = (context: CooperativeContext) =>
  hasAccess(context.permissions, 'invoicing', 'manage');
