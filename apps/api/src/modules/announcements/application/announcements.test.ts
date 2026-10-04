import { beforeEach, describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InProcessEventBus } from '../../../shared/events';
import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import {
  AttachmentRejectedError,
  InvalidAnnouncementError,
  InvalidAnnouncementTransitionError,
} from '../domain/errors';
import {
  addAttachment,
  type AnnouncementDeps,
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
  PAGE_SIZE,
  publishAnnouncement,
  updateAnnouncement,
  withdrawAnnouncement,
} from './announcements';
import { AnnouncementNotFoundError } from './errors';
import type { AnnouncementEvent } from './events';
import { InMemoryAnnouncementStore } from './testing/in-memory-announcement-store';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER_COOP = '40000000-0000-4000-8000-000000000002';
const pdf = (text = 'contenido') => new TextEncoder().encode(`%PDF-1.4 ${text}`);

function context(
  membershipId: string,
  level: 'consulta' | 'gestion' | null,
  cooperativeId = COOP,
): CooperativeContext {
  return {
    userId: `user-${membershipId}`,
    sessionId: 'session',
    cooperativeId,
    membershipId,
    profileName: 'x',
    isPartner: true,
    permissions: level ? [{ module: 'comunicados', level, scope: 'todas' }] : [],
  };
}

const manager = context('mem-gestor', 'gestion');
const reader = context('mem-socio', 'consulta');

let store: InMemoryAnnouncementStore;
let files: InMemoryFileStorage;
let published: AnnouncementEvent[];
let deps: AnnouncementDeps;
let now: Date;

beforeEach(() => {
  store = new InMemoryAnnouncementStore();
  files = new InMemoryFileStorage();
  published = [];
  now = new Date('2026-10-10T10:00:00Z');
  const events = new InProcessEventBus<AnnouncementEvent>({ onHandlerError: () => {} });
  events.subscribe('ComunicadoPublicado', (event) => void published.push(event));
  deps = {
    announcements: store,
    files,
    events,
    now: () => now,
    members: {
      countActiveMembers: async () => 10,
      displayNames: async (_coop, ids) => new Map(ids.map((id) => [id, `Nombre de ${id}`])),
    },
  };
});

const draft = (title = 'Asamblea', body = 'Se convoca la asamblea.') =>
  createAnnouncement(deps, manager, { title, body });

async function publishedAnnouncement(title = 'Asamblea') {
  const created = await draft(title);
  now = new Date(now.getTime() + 60_000);
  return publishAnnouncement(deps, manager, created.id);
}

describe('publicar (HU-COM-01)', () => {
  it('Dado un título y un cuerpo válidos, cuando lo guardo, entonces queda como borrador visible solo con gestión', async () => {
    const created = await draft();

    expect(created).toMatchObject({ status: 'borrador', authorMembershipId: 'mem-gestor' });
    expect((await listAnnouncements(deps, reader, 0)).items).toEqual([]);
    expect((await listAnnouncements(deps, manager, 0)).items).toHaveLength(1);
  });

  it('Dado un borrador, cuando lo publico, entonces lo ven todos y se emite ComunicadoPublicado', async () => {
    const result = await publishedAnnouncement();

    expect(result.status).toBe('publicado');
    expect((await listAnnouncements(deps, reader, 0)).items.map((i) => i.id)).toEqual([result.id]);
    expect(published).toEqual([
      {
        type: 'ComunicadoPublicado',
        occurredAt: now,
        payload: { cooperativeId: COOP, announcementId: result.id, title: 'Asamblea' },
      },
    ]);
  });

  it('publicar dos veces falla y no emite un segundo evento (RN-COM-07)', async () => {
    const result = await publishedAnnouncement();

    await expect(publishAnnouncement(deps, manager, result.id)).rejects.toThrow(
      InvalidAnnouncementTransitionError,
    );
    expect(published).toHaveLength(1);
  });

  it('Dado un comunicado sin cuerpo, cuando intento publicarlo, entonces no se publica ni se emite nada', async () => {
    const created = await createAnnouncement(deps, manager, { title: 'Solo título', body: '' });

    await expect(publishAnnouncement(deps, manager, created.id)).rejects.toThrow(
      InvalidAnnouncementError,
    );
    expect(published).toEqual([]);
  });
});

describe('permisos (HU-ACC-07)', () => {
  it('con consulta no se crea, edita, publica, retira ni adjunta', async () => {
    const created = await draft();
    const attempts = [
      createAnnouncement(deps, reader, { title: 'x', body: 'y' }),
      updateAnnouncement(deps, reader, created.id, { title: 'z' }),
      publishAnnouncement(deps, reader, created.id),
      withdrawAnnouncement(deps, reader, created.id),
      addAttachment(deps, reader, created.id, { name: 'a.pdf', content: pdf() }),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('sin el módulo no se consulta nada', async () => {
    await expect(listAnnouncements(deps, context('m', null), 0)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('consultar (HU-COM-02)', () => {
  it('Dado comunicados publicados, entonces se ordenan del más reciente al más antiguo con los fijados primero', async () => {
    const first = await publishedAnnouncement('Primero');
    await publishedAnnouncement('Segundo');
    await publishedAnnouncement('Tercero');
    await updateAnnouncement(deps, manager, first.id, { pinned: true });

    const titles = (await listAnnouncements(deps, reader, 0)).items.map((i) => i.title);

    expect(titles).toEqual(['Primero', 'Tercero', 'Segundo']);
  });

  it('Dado comunicados que no he abierto, entonces aparecen como no leídos', async () => {
    const a = await publishedAnnouncement('A');
    await publishedAnnouncement('B');
    await getAnnouncement(deps, reader, a.id);

    const items = (await listAnnouncements(deps, reader, 0)).items;

    expect(items.map((i) => [i.title, i.read])).toEqual([
      ['B', false],
      ['A', true],
    ]);
  });

  it('Dado más de 20 comunicados, cuando llego al final, entonces se cargan los siguientes', async () => {
    for (let i = 0; i < PAGE_SIZE + 3; i++) await publishedAnnouncement(`C${i}`);

    const first = await listAnnouncements(deps, reader, 0);
    const second = await listAnnouncements(deps, reader, first.nextOffset!);

    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.nextOffset).toBe(PAGE_SIZE);
    expect(second.items).toHaveLength(3);
    expect(second.nextOffset).toBeNull();
  });

  it('incluye el nombre del autor', async () => {
    await publishedAnnouncement();

    expect((await listAnnouncements(deps, reader, 0)).items[0]?.authorName).toBe(
      'Nombre de mem-gestor',
    );
  });
});

describe('leer (HU-COM-03)', () => {
  it('Dado un comunicado publicado, cuando lo abro, entonces veo sus datos y queda leído una sola vez', async () => {
    const result = await publishedAnnouncement();
    const firstOpen = now;

    const detail = await getAnnouncement(deps, reader, result.id);
    now = new Date(now.getTime() + 3600_000);
    await getAnnouncement(deps, reader, result.id);

    expect(detail).toMatchObject({
      title: 'Asamblea',
      authorName: 'Nombre de mem-gestor',
      readStats: null,
    });
    expect(store.reads.get(`${result.id}:mem-socio`)).toEqual(firstOpen);
    expect(store.reads.size).toBe(1);
  });

  it('Dado un adjunto, cuando lo abro, entonces se descarga con una URL firmada de 5 minutos', async () => {
    const result = await publishedAnnouncement();
    await addAttachment(deps, manager, result.id, { name: 'Orden del día.pdf', content: pdf() });

    const detail = await getAnnouncement(deps, reader, result.id);

    expect(detail.attachments).toEqual([
      expect.objectContaining({
        name: 'Orden del día.pdf',
        url: expect.stringContaining('expires=300'),
      }),
    ]);
    expect(detail.attachments[0]).not.toHaveProperty('fileKey');
  });

  it('Dado un comunicado retirado o en borrador, cuando lo abro sin gestión, entonces no existe', async () => {
    const created = await draft();
    const withdrawn = await publishedAnnouncement();
    await withdrawAnnouncement(deps, manager, withdrawn.id);

    for (const id of [created.id, withdrawn.id]) {
      await expect(getAnnouncement(deps, reader, id)).rejects.toThrow(AnnouncementNotFoundError);
    }
  });

  it('un comunicado de otra cooperativa no existe (ADR-003)', async () => {
    const result = await publishedAnnouncement();

    await expect(
      getAnnouncement(deps, context('mem-x', 'gestion', OTHER_COOP), result.id),
    ).rejects.toThrow(AnnouncementNotFoundError);
  });

  it('abrir un borrador con gestión no cuenta como lectura', async () => {
    const created = await draft();

    await getAnnouncement(deps, manager, created.id);

    expect(store.reads.size).toBe(0);
  });
});

describe('editar y retirar (HU-COM-05)', () => {
  it('Dado un comunicado publicado, cuando lo edito, entonces queda marcado como editado y no se reenvía el aviso', async () => {
    const result = await publishedAnnouncement();
    now = new Date('2026-10-12T09:00:00Z');

    const edited = await updateAnnouncement(deps, manager, result.id, { body: 'Corregido' });

    expect(edited).toMatchObject({ body: 'Corregido', editedAt: now });
    expect(published).toHaveLength(1);
  });

  it('Dado un comunicado publicado, cuando lo retiro, entonces deja de verse con consulta', async () => {
    const result = await publishedAnnouncement();

    await withdrawAnnouncement(deps, manager, result.id);

    expect((await listAnnouncements(deps, reader, 0)).items).toEqual([]);
    expect((await listAnnouncements(deps, manager, 0)).items[0]?.status).toBe('retirado');
  });
});

describe('cuántos lo han leído (HU-COM-07)', () => {
  it('con gestión se ven las lecturas sobre los miembros activos', async () => {
    const result = await publishedAnnouncement();
    await getAnnouncement(deps, reader, result.id);
    await getAnnouncement(deps, context('mem-otro', 'consulta'), result.id);

    const detail = await getAnnouncement(deps, manager, result.id);

    // También cuenta la lectura del propio gestor al abrirlo.
    expect(detail.readStats).toEqual({ readCount: 3, activeMembers: 10 });
  });
});

describe('adjuntos (RN-COM-05)', () => {
  it('guarda el PDF en el almacenamiento con una clave de la cooperativa', async () => {
    const created = await draft();

    const attachment = await addAttachment(deps, manager, created.id, {
      name: 'a.pdf',
      content: pdf(),
    });

    expect(attachment).toMatchObject({ name: 'a.pdf', size: pdf().byteLength });
    expect([...files.files.keys()]).toEqual([
      expect.stringMatching(new RegExp(`^cooperativas/${COOP}/comunicados/`)),
    ]);
  });

  it('rechaza por contenido un fichero que no es PDF, sin subirlo', async () => {
    const created = await draft();

    await expect(
      addAttachment(deps, manager, created.id, {
        name: 'falso.pdf',
        content: new TextEncoder().encode('<html>'),
      }),
    ).rejects.toThrow(AttachmentRejectedError);
    expect(files.files.size).toBe(0);
  });

  it('un cuarto adjunto se rechaza', async () => {
    const created = await draft();
    for (let i = 0; i < 3; i++) {
      await addAttachment(deps, manager, created.id, { name: `${i}.pdf`, content: pdf() });
    }

    await expect(
      addAttachment(deps, manager, created.id, { name: '4.pdf', content: pdf() }),
    ).rejects.toMatchObject({ reason: 'too_many' });
    expect(files.files.size).toBe(3);
  });

  it('si se rechaza bajo bloqueo, borra el fichero ya subido', async () => {
    const created = await draft();
    const original = store.addAttachment.bind(store);
    store.addAttachment = async (coop, id, check, attachment) => {
      // Otra subida simultánea ocupó las plazas mientras esta subía el fichero.
      return original(coop, id, (current) => check(current, 3), attachment);
    };

    await expect(
      addAttachment(deps, manager, created.id, { name: 'a.pdf', content: pdf() }),
    ).rejects.toThrow(AttachmentRejectedError);
    expect(files.files.size).toBe(0);
  });
});
