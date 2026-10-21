import type { ValidationIssue } from '@multicooperativa/contracts';
import type { z } from 'zod';

/** Field paths and Zod issue codes of a failed contract: no values, so nothing sensitive leaks. */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
  }));
}

/** The request does not match its contract: 400 `invalid_request`, handled by the app. */
export class InvalidRequestError extends Error {
  constructor(readonly issues: ValidationIssue[] = []) {
    super('The request does not match the contract.');
    this.name = 'InvalidRequestError';
  }
}

/** Validates a body against its schema from `@multicooperativa/contracts`. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new InvalidRequestError(toValidationIssues(result.error));
  return result.data;
}
