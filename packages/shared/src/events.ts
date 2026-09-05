export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
}

export interface DomainEventEnvelope<TEvent extends DomainEvent = DomainEvent> {
  readonly schemaVersion: 1;
  readonly event: TEvent;
}

export interface AuthUserCreated extends DomainEvent {
  readonly eventType: "AuthUserCreated";
  readonly payload: {
    readonly name: string;
    readonly email: string;
  };
}

export interface AuthUserSignedIn extends DomainEvent {
  readonly eventType: "AuthUserSignedIn";
  readonly payload: {
    readonly name: string;
    readonly email: string;
  };
}

export type AuthEvent = AuthUserCreated | AuthUserSignedIn;
