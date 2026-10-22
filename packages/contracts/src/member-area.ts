import { z } from 'zod';

import { moneySchema } from './invoicing';
import { pageQuerySchema } from './pagination';

/** BR-MEM-02. */
export const capitalMovementTypeSchema = z.enum([
  'mandatory_contribution',
  'voluntary_contribution',
  'refund',
  'correction',
]);
export type CapitalMovementType = z.infer<typeof capitalMovementTypeSchema>;

const isoDate = z.iso.datetime();

/**
 * Amounts are decimal strings in euros (BR-MEM-04). The movement `amount` is as registered:
 * positive for contributions and refunds, signed for a correction (BR-MEM-03).
 */
export const capitalMovementSchema = z.object({
  id: z.uuid(),
  /** YYYY-MM-DD. */
  date: z.iso.date(),
  type: capitalMovementTypeSchema,
  concept: z.string(),
  amount: moneySchema,
  recordedAt: isoDate,
});

/** The member's data in the cooperative (US-MEM-01). */
export const memberRecordSchema = z.object({
  membershipId: z.uuid(),
  name: z.string(),
  email: z.string(),
  partnerNumber: z.string().nullable(),
  isPartner: z.boolean(),
  status: z.enum(['invited', 'active', 'suspended', 'removed']),
  profileName: z.string(),
  /** YYYY-MM-DD. */
  joinedAt: z.iso.date(),
});

/** GET /cooperatives/{id}/member-area/me */
export const myMemberAreaResponseSchema = z.object({
  member: memberRecordSchema,
  /** Share capital of the member. Never negative (BR-MEM-03). */
  capital: moneySchema,
});

/** GET .../member-area/me/movements and .../members/{membershipId}/movements: `limit` and `before` (keyset pages). */
export const listMovementsQuerySchema = pageQuerySchema;

/**
 * Newest first, a page at a time. `capital` is the member's whole capital, summed on the server:
 * it does not depend on the page.
 */
export const memberMovementsResponseSchema = z.object({
  member: memberRecordSchema,
  capital: moneySchema,
  movements: z.array(capitalMovementSchema),
  /** Pass it as `before` for the next page; null on the last one. */
  nextCursor: z.string().nullable(),
});

/** GET .../member-area/members (US-MEM-04). */
export const memberCapitalSchema = z.object({
  member: memberRecordSchema,
  capital: moneySchema,
});
export const listMembersCapitalResponseSchema = z.object({
  items: z.array(memberCapitalSchema),
  /** Share capital of the cooperative. */
  totalCapital: moneySchema,
});

/** POST .../members/{membershipId}/movements (US-MEM-03). */
export const registerCapitalMovementRequestSchema = z.object({
  date: z.iso.date(),
  type: capitalMovementTypeSchema,
  concept: z.string().max(200),
  amount: moneySchema,
});
export const registerCapitalMovementResponseSchema = z.object({
  movement: capitalMovementSchema,
  /** The member's capital after the movement. */
  capital: moneySchema,
});

export type MemberRecord = z.infer<typeof memberRecordSchema>;
export type CapitalMovement = z.infer<typeof capitalMovementSchema>;
export type MyMemberAreaResponse = z.infer<typeof myMemberAreaResponseSchema>;
export type MemberMovementsResponse = z.infer<typeof memberMovementsResponseSchema>;
export type MemberCapital = z.infer<typeof memberCapitalSchema>;
export type ListMembersCapitalResponse = z.infer<typeof listMembersCapitalResponseSchema>;
export type RegisterCapitalMovementRequest = z.infer<typeof registerCapitalMovementRequestSchema>;
export type RegisterCapitalMovementResponse = z.infer<typeof registerCapitalMovementResponseSchema>;
