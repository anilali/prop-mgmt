import type { DomainEvent } from "@moonship/shared";

import type { EventDispatcher } from "./event-dispatcher";

export class NoopEventDispatcher implements EventDispatcher {
  async dispatch(_events: DomainEvent[]): Promise<void> {
    // intentionally empty
  }
}
