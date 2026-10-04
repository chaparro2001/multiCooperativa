import { describe, expect, it, vi } from 'vitest';

import type { DomainEvent } from './event-bus';
import { InProcessEventBus } from './in-process-event-bus';

type ComunicadoPublicado = DomainEvent<
  'ComunicadoPublicado',
  { cooperativaId: string; comunicadoId: string }
>;
type FacturaVencida = DomainEvent<'FacturaVencida', { cooperativaId: string; facturaId: string }>;
type TestEvents = ComunicadoPublicado | FacturaVencida;

const comunicadoPublicado: ComunicadoPublicado = {
  type: 'ComunicadoPublicado',
  occurredAt: new Date('2026-10-05T10:00:00Z'),
  payload: { cooperativaId: 'coop-1', comunicadoId: 'com-1' },
};

function createBus(onHandlerError = vi.fn()) {
  return { bus: new InProcessEventBus<TestEvents>({ onHandlerError }), onHandlerError };
}

describe('InProcessEventBus', () => {
  it('entrega el evento a todos los suscriptores de su tipo', async () => {
    const { bus } = createBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe('ComunicadoPublicado', first);
    bus.subscribe('ComunicadoPublicado', second);

    await bus.publish(comunicadoPublicado);

    expect(first).toHaveBeenCalledExactlyOnceWith(comunicadoPublicado);
    expect(second).toHaveBeenCalledExactlyOnceWith(comunicadoPublicado);
  });

  it('no entrega el evento a suscriptores de otro tipo', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    bus.subscribe('FacturaVencida', handler);

    await bus.publish(comunicadoPublicado);

    expect(handler).not.toHaveBeenCalled();
  });

  it('publicar sin suscriptores no falla', async () => {
    const { bus } = createBus();

    await expect(bus.publish(comunicadoPublicado)).resolves.toBeUndefined();
  });

  it('espera a los manejadores asíncronos antes de resolver', async () => {
    const { bus } = createBus();
    const order: string[] = [];
    bus.subscribe('ComunicadoPublicado', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('handler');
    });

    await bus.publish(comunicadoPublicado);
    order.push('published');

    expect(order).toEqual(['handler', 'published']);
  });

  it('un manejador que falla no afecta al emisor ni a los demás suscriptores', async () => {
    const { bus, onHandlerError } = createBus();
    const error = new Error('push caído');
    const healthy = vi.fn();
    bus.subscribe('ComunicadoPublicado', () => {
      throw error;
    });
    bus.subscribe('ComunicadoPublicado', healthy);

    await expect(bus.publish(comunicadoPublicado)).resolves.toBeUndefined();

    expect(healthy).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledExactlyOnceWith(error, comunicadoPublicado);
  });

  it('también aísla el rechazo de un manejador asíncrono', async () => {
    const { bus, onHandlerError } = createBus();
    const error = new Error('timeout');
    bus.subscribe('ComunicadoPublicado', () => Promise.reject(error));

    await bus.publish(comunicadoPublicado);

    expect(onHandlerError).toHaveBeenCalledExactlyOnceWith(error, comunicadoPublicado);
  });

  it('deja de entregar tras cancelar la suscripción', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('ComunicadoPublicado', handler);

    unsubscribe();
    await bus.publish(comunicadoPublicado);

    expect(handler).not.toHaveBeenCalled();
  });
});
