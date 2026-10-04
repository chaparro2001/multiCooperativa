import type { Express } from 'express';

import { createApp } from './app';
import { type AuthRateLimits, createAccessModule, type InvitationSender } from './modules/access';
import type { PrismaClient } from './shared/infrastructure/prisma';

export interface ApiDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  invitationSender: InvitationSender;
  authRateLimits?: AuthRateLimits | false;
  trustProxy?: number | false;
}

/**
 * Wires every module into the HTTP app. The only composition root: `main.ts`
 * runs it and the isolation test walks all the routes it registers.
 */
export function createApi(deps: ApiDeps): Express {
  const access = createAccessModule({
    prisma: deps.prisma,
    jwtSecret: deps.jwtSecret,
    invitationSender: deps.invitationSender,
    authRateLimits: deps.authRateLimits,
  });

  return createApp({
    routers: [access.router],
    errorHandlers: [access.errorHandler],
    trustProxy: deps.trustProxy,
  });
}
