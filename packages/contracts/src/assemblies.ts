import { z } from 'zod';

export const assemblyTypeSchema = z.enum(['ordinaria', 'extraordinaria']);
export const assemblyStatusSchema = z.enum(['borrador', 'convocada', 'celebrada', 'cancelada']);
export const majoritySchema = z.enum(['simple', 'reforzada']);
export const votingStatusSchema = z.enum(['pendiente', 'abierta', 'cerrada']);
export const voteChoiceSchema = z.enum(['a_favor', 'en_contra', 'abstencion']);
export const votingOutcomeSchema = z.enum(['aprobado', 'rechazado', 'sin_quorum']);

const instant = z.iso.datetime({ offset: true });

/** Un punto del orden del día; `id` para conservar uno existente al editar el borrador. */
export const pointInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().max(200),
  description: z.string().max(5000).default(''),
  votable: z.boolean(),
  /** Obligatoria si es votable (HU-ASA-02). */
  majority: majoritySchema.nullable(),
});

/** POST /asambleas y PATCH /asambleas/{id}: el borrador completo, puntos en su orden. */
export const assemblyInputSchema = z.object({
  type: assemblyTypeSchema,
  firstCallAt: instant,
  secondCallAt: instant.nullable(),
  place: z.string().max(200),
  points: z.array(pointInputSchema).max(50),
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

/** GET /asambleas: próximas primero, después celebradas (HU-ASA-03). */
export const listAssembliesResponseSchema = z.object({ items: z.array(assemblySummarySchema) });

const tallySchema = z.object({
  inFavor: z.number().int(),
  against: z.number().int(),
  abstentions: z.number().int(),
});

/** Lo que ve un miembro de una votación (HU-ASA-06). */
export const votingViewSchema = z.object({
  status: votingStatusSchema,
  /** Socios del censo, fijado al abrir; nulo mientras está pendiente. */
  censusSize: z.number().int().nullable(),
  votesCast: z.number().int(),
  /** Nulo mientras está abierta y no se tiene gestión (RN-ASA-11). */
  tally: tallySchema.nullable(),
  result: tallySchema
    .extend({
      census: z.number().int(),
      votesCast: z.number().int(),
      quorumReached: z.boolean(),
      call: z.enum(['primera', 'segunda']),
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

/** GET /asambleas/{id}: orden del día con documentación y estado de cada votación. */
export const assemblyDetailSchema = assemblySummarySchema
  .omit({ pointCount: true, openVotings: true })
  .extend({
    points: z.array(
      z.object({
        id: z.uuid(),
        position: z.number().int(),
        title: z.string(),
        description: z.string(),
        votable: z.boolean(),
        majority: majoritySchema.nullable(),
        /** `url` firmada de 5 minutos: se vuelve a pedir el detalle al abrir. */
        attachments: z.array(pointAttachmentSchema.extend({ url: z.url() })),
        voting: votingViewSchema.nullable(),
      }),
    ),
  });

/** POST /puntos/{puntoId}/votacion/votos (HU-ASA-05). */
export const castVoteRequestSchema = z.object({ choice: voteChoiceSchema });

export type AssemblyType = z.infer<typeof assemblyTypeSchema>;
export type AssemblyStatus = z.infer<typeof assemblyStatusSchema>;
export type Majority = z.infer<typeof majoritySchema>;
export type VoteChoice = z.infer<typeof voteChoiceSchema>;
export type VotingOutcome = z.infer<typeof votingOutcomeSchema>;
export type PointInput = z.infer<typeof pointInputSchema>;
export type AssemblyInput = z.infer<typeof assemblyInputSchema>;
export type AssemblySummary = z.infer<typeof assemblySummarySchema>;
export type ListAssembliesResponse = z.infer<typeof listAssembliesResponseSchema>;
export type VotingView = z.infer<typeof votingViewSchema>;
export type AssemblyDetail = z.infer<typeof assemblyDetailSchema>;
export type PointAttachment = z.infer<typeof pointAttachmentSchema>;
