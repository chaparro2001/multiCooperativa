import type { RequestHandler, Response } from 'express';

import type { CooperativeContext, SessionContext } from '../../application/request-context';
import { type AccessLevel, type Module, requireAccess } from '../../domain/permission';

const SESSION = 'accessSession';
const COOPERATIVE = 'accessCooperative';

export interface RequestContextUseCases {
  authenticate(accessToken: string | undefined): Promise<SessionContext>;
  resolveCooperative(session: SessionContext, cooperativeId: string): Promise<CooperativeContext>;
}

function bearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer (\S+)$/i);
  return match?.[1];
}

/** 401 unless the request carries a valid access token of an open session. */
export function createRequireSession(useCases: RequestContextUseCases): RequestHandler {
  return async (req, res, next) => {
    res.locals[SESSION] = await useCases.authenticate(bearerToken(req.headers.authorization));
    next();
  };
}

/**
 * For routes under `/cooperatives/:cooperativeId`: 404 unless the user has an
 * active membership there (ADR-003). Implies `requireSession`.
 */
export function createRequireCooperative(useCases: RequestContextUseCases): RequestHandler {
  return async (req, res, next) => {
    const session = await useCases.authenticate(bearerToken(req.headers.authorization));
    const cooperativeId = req.params.cooperativeId;
    if (typeof cooperativeId !== 'string') {
      throw new Error('requireCooperative needs the :cooperativeId parameter in the route.');
    }
    res.locals[SESSION] = session;
    res.locals[COOPERATIVE] = await useCases.resolveCooperative(session, cooperativeId);
    next();
  };
}

/**
 * Route-level guard: 403 before any logic runs (US-ACC-07). Use cases still
 * call `requireAccess` themselves; this only rejects early.
 */
export function requirePermission(module: Module, level: AccessLevel): RequestHandler {
  return (_req, res, next) => {
    requireAccess(getCooperativeContext(res).permissions, module, level);
    next();
  };
}

export function getSessionContext(res: Response): SessionContext {
  const session = res.locals[SESSION] as SessionContext | undefined;
  if (!session) throw new Error('Route without requireSession: there is no session context.');
  return session;
}

export function getCooperativeContext(res: Response): CooperativeContext {
  const context = res.locals[COOPERATIVE] as CooperativeContext | undefined;
  if (!context)
    throw new Error('Route without requireCooperative: there is no cooperative context.');
  return context;
}
