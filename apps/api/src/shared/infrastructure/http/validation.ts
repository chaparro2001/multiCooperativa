import type { z } from 'zod';

/** The request does not match its contract: 400 `invalid_request`, handled by the app. */
export class InvalidRequestError extends Error {
  constructor() {
    super('The request does not match the contract.');
    this.name = 'InvalidRequestError';
  }
}

/** Validates a body against its schema from `@multicooperativa/contracts`. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new InvalidRequestError();
  return result.data;
}
