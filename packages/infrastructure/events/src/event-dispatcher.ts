import type { DomainEvent } from "@moonship/shared";

export interface EventDispatcher {
  dispatch(events: DomainEvent[]): Promise<void>;
}
