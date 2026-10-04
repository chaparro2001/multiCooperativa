import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from './event-bus';

export interface InProcessEventBusOptions {
  /** Called when a handler throws or rejects; the emitter is not affected. */
  onHandlerError: (error: unknown, event: DomainEvent) => void;
}

/**
 * In-process bus for the MVP: handlers run in subscription order within the
 * same process and `publish` resolves once all of them have finished.
 */
export class InProcessEventBus<
  TEvents extends DomainEvent = DomainEvent,
> implements EventBus<TEvents> {
  private readonly handlers = new Map<string, Set<EventHandler<never>>>();

  constructor(private readonly options: InProcessEventBusOptions) {}

  subscribe<TType extends TEvents['type']>(
    type: TType,
    handler: EventHandler<Extract<TEvents, { type: TType }>>,
  ): Unsubscribe {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(handler);
    };
  }

  async publish(event: TEvents): Promise<void> {
    const handlers = [...(this.handlers.get(event.type) ?? [])] as EventHandler<TEvents>[];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.options.onHandlerError(error, event);
      }
    }
  }
}
