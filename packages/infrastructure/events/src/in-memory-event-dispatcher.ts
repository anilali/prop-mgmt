import type { DomainEvent } from "@moonship/shared";

import type { EventDispatcher } from "./event-dispatcher";

export type EventHandler = (event: DomainEvent) => Promise<void>;

export class InMemoryEventDispatcher implements EventDispatcher {
  private handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  subscribeAll(handler: EventHandler): void {
    this.subscribe("*", handler);
  }

  async dispatch(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const specific = this.handlers.get(event.eventType) ?? [];
      const wildcard = this.handlers.get("*") ?? [];
      for (const handler of [...specific, ...wildcard]) {
        await handler(event);
      }
    }
  }
}
