import { z } from 'zod';

export const assemblyTypeSchema = z.enum(['ordinary', 'extraordinary']);
export const assemblyStatusSchema = z.enum(['draft', 'convened', 'held', 'cancelled']);
export const majoritySchema = z.enum(['simple', 'reinforced']);
export const votingStatusSchema = z.enum(['pending', 'open', 'closed']);
export const voteChoiceSchema = z.enum(['in_favor', 'against', 'abstention']);
export const votingOutcomeSchema = z.enum(['approved', 'rejected', 'no_quorum']);

const instant = z.iso.datetime({ offset: true });

/** An agenda point; `id` keeps an existing one when editing the draft. */
export const pointInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().max(200),
  description: z.string().max(5000).default(''),
  votable: z.boolean(),
  /** Required if votable (US-ASM-02). */
  majority: majoritySchema.nullable(),
});

/** POST /assemblies and PATCH /assemblies/{id}: the whole draft, points in order. */
export const assemblyInputSchema = z.object({
  type: assemblyTypeSchema,
  firstCallAt: instant,
  secondCallAt: instant.nullable(),
  place: z.string().max(200),
  points: z.array(pointInputSchema).max(50),
});

/** POST /assemblies/{id}/reschedule (US-ASM-09): only for a convened assembly with no voting opened. */
export const rescheduleAssemblyRequestSchema = z.object({
  firstCallAt: instant,
  secondCallAt: instant.nullable().default(null),
  place: z.string().max(200),
  reason: z.string().max(500).nullable().default(null),
  /** Publishes an announcement for the members with the change. */
  notifyMembers: z.boolean().default(true),
});

export const assemblySummarySchema = z.object({
  id: z.uuid(),
  type: assemblyTypeSchema,
  status: assemblyStatusSchema,
  firstCallAt: instant,
  secondCallAt: instant.nullable(),
  place: z.string(),
  pointCount: z.number().int(),
  openVotings: z.number().int(),
});

/** GET /assemblies: upcoming first, then held (US-ASM-03). */
export const listAssembliesResponseSchema = z.object({ items: z.array(assemblySummarySchema) });

const tallySchema = z.object({
  inFavor: z.number().int(),
  against: z.number().int(),
  abstentions: z.number().int(),
});

/** What a member sees of a voting (US-ASM-06). */
export const votingViewSchema = z.object({
  status: votingStatusSchema,
  /** Partners in the census, fixed on opening; null while pending. */
  censusSize: z.number().int().nullable(),
  votesCast: z.number().int(),
  /** Required participation as a fraction of the census (0..1); null when no quorum applies (BR-ASM-05). */
  quorumRequired: z.number().min(0).max(1).nullable(),
  /** Null while open and without manage access (BR-ASM-11). */
  tally: tallySchema.nullable(),
  result: tallySchema
    .extend({
      census: z.number().int(),
      votesCast: z.number().int(),
      quorumReached: z.boolean(),
      call: z.enum(['first', 'second']),
      outcome: votingOutcomeSchema,
    })
    .nullable(),
  myVote: voteChoiceSchema.nullable(),
  canVote: z.boolean(),
});

export const pointAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  size: z.number().int(),
});

/** GET /assemblies/{id}: agenda with documentation and the state of each voting. */
export const assemblyDetailSchema = assemblySummarySchema
  .omit({ pointCount: true, openVotings: true })
  .extend({
    /** Set once a convened assembly was moved: what it was before (US-ASM-09). */
    rescheduledFrom: z
      .object({
        firstCallAt: instant,
        secondCallAt: instant.nullable(),
        place: z.string(),
        at: instant,
        reason: z.string().nullable(),
      })
      .nullable(),
    points: z.array(
      z.object({
        id: z.uuid(),
        position: z.number().int(),
        title: z.string(),
        description: z.string(),
        votable: z.boolean(),
        majority: majoritySchema.nullable(),
        /** Signed 5-minute `url`: the detail is requested again on open. */
        attachments: z.array(pointAttachmentSchema.extend({ url: z.url() })),
        voting: votingViewSchema.nullable(),
      }),
    ),
  });

/** POST /points/{pointId}/voting/votes (US-ASM-05). */
export const castVoteRequestSchema = z.object({ choice: voteChoiceSchema });

export type AssemblyType = z.infer<typeof assemblyTypeSchema>;
export type AssemblyStatus = z.infer<typeof assemblyStatusSchema>;
export type Majority = z.infer<typeof majoritySchema>;
export type VoteChoice = z.infer<typeof voteChoiceSchema>;
export type VotingOutcome = z.infer<typeof votingOutcomeSchema>;
export type PointInput = z.infer<typeof pointInputSchema>;
export type AssemblyInput = z.infer<typeof assemblyInputSchema>;
export type RescheduleAssemblyRequest = z.input<typeof rescheduleAssemblyRequestSchema>;
export type AssemblySummary = z.infer<typeof assemblySummarySchema>;
export type ListAssembliesResponse = z.infer<typeof listAssembliesResponseSchema>;
export type VotingView = z.infer<typeof votingViewSchema>;
export type AssemblyDetail = z.infer<typeof assemblyDetailSchema>;
export type PointAttachment = z.infer<typeof pointAttachmentSchema>;
