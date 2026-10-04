/** Something that happened in a module and that other modules may react to. */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export type EventHandler<TEvent extends DomainEvent> = (event: TEvent) => void | Promise<void>;

export type Unsubscribe = () => void;

/** What an emitting module needs: a bus of a wider event union also satisfies it. */
export interface EventPublisher<TEvents extends DomainEvent = DomainEvent> {
  publish(event: TEvents): Promise<void>;
}

/** What a reacting module needs, for the events it listens to. */
export interface EventSubscriber<TEvents extends DomainEvent = DomainEvent> {
  subscribe<TType extends TEvents['type']>(
    type: TType,
    handler: EventHandler<Extract<TEvents, { type: TType }>>,
  ): Unsubscribe;
}

/**
 * Port for internal events between modules (ADR-002). Emitters do not know
 * their subscribers, and a failing subscriber never fails the emitter.
 */
export interface EventBus<TEvents extends DomainEvent = DomainEvent> {
  publish(event: TEvents): Promise<void>;
  subscribe<TType extends TEvents['type']>(
    type: TType,
    handler: EventHandler<Extract<TEvents, { type: TType }>>,
  ): Unsubscribe;
}
