import { describe, expect, it, vi } from 'vitest';

import type { DomainEvent } from './event-bus';
import { InProcessEventBus } from './in-process-event-bus';

type AnnouncementPublished = DomainEvent<
  'AnnouncementPublished',
  { cooperativeId: string; announcementId: string }
>;
type InvoiceOverdue = DomainEvent<'InvoiceOverdue', { cooperativeId: string; invoiceId: string }>;
type TestEvents = AnnouncementPublished | InvoiceOverdue;

const announcementPublished: AnnouncementPublished = {
  type: 'AnnouncementPublished',
  occurredAt: new Date('2026-10-05T10:00:00Z'),
  payload: { cooperativeId: 'coop-1', announcementId: 'ann-1' },
};

function createBus(onHandlerError = vi.fn()) {
  return { bus: new InProcessEventBus<TestEvents>({ onHandlerError }), onHandlerError };
}

describe('InProcessEventBus', () => {
  it('delivers the event to every subscriber of its type', async () => {
    const { bus } = createBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe('AnnouncementPublished', first);
    bus.subscribe('AnnouncementPublished', second);

    await bus.publish(announcementPublished);

    expect(first).toHaveBeenCalledExactlyOnceWith(announcementPublished);
    expect(second).toHaveBeenCalledExactlyOnceWith(announcementPublished);
  });

  it('does not deliver the event to subscribers of another type', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    bus.subscribe('InvoiceOverdue', handler);

    await bus.publish(announcementPublished);

    expect(handler).not.toHaveBeenCalled();
  });

  it('publishing without subscribers does not fail', async () => {
    const { bus } = createBus();

    await expect(bus.publish(announcementPublished)).resolves.toBeUndefined();
  });

  it('waits for async handlers before resolving', async () => {
    const { bus } = createBus();
    const order: string[] = [];
    bus.subscribe('AnnouncementPublished', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('handler');
    });

    await bus.publish(announcementPublished);
    order.push('published');

    expect(order).toEqual(['handler', 'published']);
  });

  it('a failing handler affects neither the publisher nor the other subscribers', async () => {
    const { bus, onHandlerError } = createBus();
    const error = new Error('push down');
    const healthy = vi.fn();
    bus.subscribe('AnnouncementPublished', () => {
      throw error;
    });
    bus.subscribe('AnnouncementPublished', healthy);

    await expect(bus.publish(announcementPublished)).resolves.toBeUndefined();

    expect(healthy).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledExactlyOnceWith(error, announcementPublished);
  });

  it('also isolates the rejection of an async handler', async () => {
    const { bus, onHandlerError } = createBus();
    const error = new Error('timeout');
    bus.subscribe('AnnouncementPublished', () => Promise.reject(error));

    await bus.publish(announcementPublished);

    expect(onHandlerError).toHaveBeenCalledExactlyOnceWith(error, announcementPublished);
  });

  it('stops delivering after the subscription is cancelled', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('AnnouncementPublished', handler);

    unsubscribe();
    await bus.publish(announcementPublished);

    expect(handler).not.toHaveBeenCalled();
  });
});
