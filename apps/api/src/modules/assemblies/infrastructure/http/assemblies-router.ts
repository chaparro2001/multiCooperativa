import {
  type AssemblyDetail,
  assemblyInputSchema,
  type AssemblySummary,
  castVoteRequestSchema,
  type ListAssembliesResponse,
  type PointAttachment,
  type VotingView,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';
import multer from 'multer';

import { getCooperativeContext, requirePermission } from '../../../access';
import { InvalidRequestError, parseBody } from '../../../../shared/infrastructure/http/validation';
import * as useCases from '../../application/assemblies';
import type { AssemblyDeps } from '../../application/assemblies';
import type { AssemblyRecord } from '../../application/ports/assembly-store';
import type { AssemblyInput } from '../../domain/assembly';

const iso = (date: Date | null) => date?.toISOString() ?? null;

function toInput(body: unknown): AssemblyInput {
  const input = parseBody(assemblyInputSchema, body);
  return {
    ...input,
    firstCallAt: new Date(input.firstCallAt),
    secondCallAt: input.secondCallAt ? new Date(input.secondCallAt) : null,
  };
}

function toSummary(assembly: AssemblyRecord): AssemblySummary {
  return {
    id: assembly.id,
    type: assembly.type,
    status: assembly.status,
    firstCallAt: assembly.firstCallAt.toISOString(),
    secondCallAt: iso(assembly.secondCallAt),
    place: assembly.place,
    pointCount: assembly.points.length,
    openVotings: 0,
  };
}

const toVoting = (view: useCases.VotingView): VotingView => view;

/** HTTP adapter of the assemblies module (docs/requirements/04-assemblies.md, section 7). */
export function createAssembliesRouter(
  deps: AssemblyDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/assemblies';
  const points = '/cooperatives/:cooperativeId/points/:pointId';
  const read = [requireCooperative, requirePermission('assemblies', 'read')];
  const manage = [requireCooperative, requirePermission('assemblies', 'manage')];
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: useCases.MAX_ATTACHMENT_BYTES, files: 1, fields: 0 },
  }).single('file');
  const assemblyId = (params: Record<string, unknown>) => String(params.assemblyId);
  const pointId = (params: Record<string, unknown>) => String(params.pointId);

  router.get(base, ...read, async (_req, res) => {
    const list = await useCases.listAssemblies(deps, getCooperativeContext(res));
    res.json({
      items: list.map((assembly) => ({
        ...assembly,
        firstCallAt: assembly.firstCallAt.toISOString(),
        secondCallAt: iso(assembly.secondCallAt),
      })),
    } satisfies ListAssembliesResponse);
  });

  router.get(`${base}/:assemblyId`, ...read, async (req, res) => {
    const detail = await useCases.getAssembly(
      deps,
      getCooperativeContext(res),
      assemblyId(req.params),
    );
    res.json({
      id: detail.id,
      type: detail.type,
      status: detail.status,
      firstCallAt: detail.firstCallAt.toISOString(),
      secondCallAt: iso(detail.secondCallAt),
      place: detail.place,
      points: detail.points.map((point) => ({
        id: point.id,
        position: point.position,
        title: point.title,
        description: point.description,
        votable: point.votable,
        majority: point.majority,
        attachments: point.attachments,
        voting: point.voting && toVoting(point.voting),
      })),
    } satisfies AssemblyDetail);
  });

  router.post(base, ...manage, async (req, res) => {
    const created = await useCases.createAssembly(
      deps,
      getCooperativeContext(res),
      toInput(req.body),
    );
    res.status(201).json(toSummary(created));
  });

  router.patch(`${base}/:assemblyId`, ...manage, async (req, res) => {
    const updated = await useCases.updateAssembly(
      deps,
      getCooperativeContext(res),
      assemblyId(req.params),
      toInput(req.body),
    );
    res.json(toSummary(updated));
  });

  const transition = (path: string, run: typeof useCases.conveneAssembly) =>
    router.post(`${base}/:assemblyId/${path}`, ...manage, async (req, res) => {
      const updated = await run(deps, getCooperativeContext(res), assemblyId(req.params));
      res.json(toSummary(updated));
    });
  transition('convene', useCases.conveneAssembly);
  transition('cancel', useCases.cancelAssembly);
  transition('close', useCases.closeAssembly);

  // US-ASM-02: documentation of an item, PDF in the `file` field.
  router.post(`${points}/documents`, ...manage, upload, async (req, res) => {
    if (!req.file) throw new InvalidRequestError();
    const name = Buffer.from(req.file.originalname, 'latin1')
      .toString('utf8')
      .split(/[\\/]/)
      .pop()
      ?.trim();
    const attachment = await useCases.addPointAttachment(
      deps,
      getCooperativeContext(res),
      pointId(req.params),
      { name: (name || 'document.pdf').slice(0, 200), content: new Uint8Array(req.file.buffer) },
    );
    res.status(201).json(attachment satisfies PointAttachment);
  });

  router.get(`${points}/voting`, ...read, async (req, res) => {
    res.json(
      toVoting(await useCases.getVoting(deps, getCooperativeContext(res), pointId(req.params))),
    );
  });

  router.post(`${points}/voting/open`, ...manage, async (req, res) => {
    res.json(
      toVoting(await useCases.openVoting(deps, getCooperativeContext(res), pointId(req.params))),
    );
  });

  router.post(`${points}/voting/close`, ...manage, async (req, res) => {
    res.json(
      toVoting(await useCases.closeVoting(deps, getCooperativeContext(res), pointId(req.params))),
    );
  });

  // US-ASM-05: no module permission; being in the census is what counts (BR-ACC-06).
  router.post(`${points}/voting/votes`, requireCooperative, async (req, res) => {
    const { choice } = parseBody(castVoteRequestSchema, req.body);
    const view = await useCases.castVote(
      deps,
      getCooperativeContext(res),
      pointId(req.params),
      choice,
    );
    res.status(201).json(toVoting(view));
  });

  return router;
}
