import type { CooperativeContext } from '../../access';
import { type AssemblyDeps, getAssembly, listAssemblies } from './assemblies';

/** What the AI assistant reads (requirements/07, section 3). Same use cases, same permissions. */
export interface AssemblyReads {
  upcoming(context: CooperativeContext): Promise<UpcomingAssembly[]>;
  votingResults(context: CooperativeContext, assemblyId?: string): Promise<AssemblyResults[]>;
}

export interface UpcomingAssembly {
  id: string;
  type: string;
  firstCallAt: string;
  secondCallAt: string | null;
  place: string;
  points: {
    title: string;
    votable: boolean;
    majority: string | null;
    votingStatus: string | null;
  }[];
}

export interface AssemblyResults {
  id: string;
  type: string;
  firstCallAt: string;
  status: string;
  results: { point: string; status: string; result: unknown; tally: unknown }[];
}

/** Assemblies without a result yet are not inspected beyond this many (keeps the tool cheap). */
const MAX_INSPECTED = 3;

export function createAssemblyReads(deps: AssemblyDeps): AssemblyReads {
  return {
    async upcoming(context) {
      const summaries = await listAssemblies(deps, context);
      const now = deps.now().getTime();
      const upcoming = summaries.filter(
        (summary) => summary.status === 'convened' && summary.firstCallAt.getTime() >= now,
      );
      const details = await Promise.all(
        upcoming.slice(0, MAX_INSPECTED).map((summary) => getAssembly(deps, context, summary.id)),
      );
      return details.map((assembly) => ({
        id: assembly.id,
        type: assembly.type,
        firstCallAt: assembly.firstCallAt.toISOString(),
        secondCallAt: assembly.secondCallAt?.toISOString() ?? null,
        place: assembly.place,
        points: assembly.points.map((point) => ({
          title: point.title,
          votable: point.votable,
          majority: point.majority,
          votingStatus: point.voting?.status ?? null,
        })),
      }));
    },

    async votingResults(context, assemblyId) {
      const ids = assemblyId
        ? [assemblyId]
        : (await listAssemblies(deps, context))
            .filter((summary) => summary.status !== 'draft' && summary.status !== 'cancelled')
            .slice(0, MAX_INSPECTED)
            .map((summary) => summary.id);
      const assemblies = await Promise.all(ids.map((id) => getAssembly(deps, context, id)));
      return assemblies
        .map((assembly) => ({
          id: assembly.id,
          type: assembly.type,
          firstCallAt: assembly.firstCallAt.toISOString(),
          status: assembly.status,
          // Only closed votings: the tally of an open one is not shown (BR-ASM-11).
          results: assembly.points.flatMap((point) =>
            point.voting?.status === 'closed'
              ? [
                  {
                    point: point.title,
                    status: point.voting.status,
                    result: point.voting.result,
                    tally: point.voting.tally,
                  },
                ]
              : [],
          ),
        }))
        .filter((assembly) => assembly.results.length > 0);
    },
  };
}
