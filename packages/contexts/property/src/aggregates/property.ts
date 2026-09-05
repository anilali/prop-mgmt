import type { DomainEvent } from "@moonship/shared";

import type { Address } from "../value-objects/address";

export interface PropertyProps {
  id: string;
  name: string;
  address: Address;
}

export class Property {
  private props: PropertyProps;
  private events: DomainEvent[] = [];

  private constructor(props: PropertyProps) {
    this.props = props;
  }

  static create(props: PropertyProps): Property {
    const property = new Property(props);
    property.addEvent({
      eventType: "PropertyRegistered",
      occurredAt: new Date(),
      aggregateId: props.id,
    });
    return property;
  }

  static reconstitute(props: PropertyProps): Property {
    return new Property(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get address(): Address {
    return this.props.address;
  }

  updateMetadata(updates: { name?: string; address?: Address }): void {
    if (updates.name) this.props.name = updates.name;
    if (updates.address) this.props.address = updates.address;

    this.addEvent({
      eventType: "PropertyMetadataUpdated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    });
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}
