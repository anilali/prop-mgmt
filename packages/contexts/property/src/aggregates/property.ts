import type { DomainEvent, IsoDate } from "@moonship/shared";
import { dayOfMonth, isIsoDate, isTimeZone } from "@moonship/shared";

import type { Address } from "../value-objects/address";

export const DEFAULT_TIME_ZONE = "America/Chicago";

export interface LetterDetails {
  ownerName: string | null;
  ownerTitle: string | null;
  companyName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
}

export interface PropertyProps {
  id: string;
  name: string;
  address: Address;
  trackingStartDate: IsoDate | null;
  timeZone: string;
  letter: LetterDetails;
}

export const EMPTY_LETTER_DETAILS: LetterDetails = {
  ownerName: null,
  ownerTitle: null,
  companyName: null,
  ownerPhone: null,
  ownerEmail: null,
};

function assertTrackingStartDate(date: IsoDate | null): void {
  if (date === null) return;
  if (!isIsoDate(date) || dayOfMonth(date) !== 1) {
    throw new Error("Tracking start date must be the first of a month");
  }
}

function assertTimeZone(timeZone: string): void {
  if (!isTimeZone(timeZone)) {
    throw new Error(`Unknown time zone: ${timeZone}`);
  }
}

function assertName(name: string): void {
  if (name.trim().length === 0) {
    throw new Error("Property name is required");
  }
}

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class Property {
  private props: PropertyProps;
  private events: DomainEvent[] = [];

  private constructor(props: PropertyProps) {
    this.props = props;
  }

  static create(
    props: Pick<PropertyProps, "id" | "name" | "address"> &
      Partial<Omit<PropertyProps, "id" | "name" | "address">>,
  ): Property {
    assertName(props.name);
    const trackingStartDate = props.trackingStartDate ?? null;
    const timeZone = props.timeZone ?? DEFAULT_TIME_ZONE;
    assertTrackingStartDate(trackingStartDate);
    assertTimeZone(timeZone);
    const property = new Property({
      id: props.id,
      name: props.name.trim(),
      address: props.address,
      trackingStartDate,
      timeZone,
      letter: { ...(props.letter ?? EMPTY_LETTER_DETAILS) },
    });
    property.addEvent({
      eventType: "PropertyRegistered",
      occurredAt: new Date(),
      aggregateId: props.id,
    });
    return property;
  }

  static reconstitute(props: PropertyProps): Property {
    return new Property({ ...props, letter: { ...props.letter } });
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

  get trackingStartDate(): IsoDate | null {
    return this.props.trackingStartDate;
  }

  get timeZone(): string {
    return this.props.timeZone;
  }

  get letter(): LetterDetails {
    return { ...this.props.letter };
  }

  updateMetadata(updates: {
    name?: string;
    address?: Address;
    timeZone?: string;
  }): void {
    if (updates.name !== undefined) assertName(updates.name);
    if (updates.timeZone !== undefined) assertTimeZone(updates.timeZone);

    if (updates.name !== undefined) this.props.name = updates.name.trim();
    if (updates.address !== undefined) this.props.address = updates.address;
    if (updates.timeZone !== undefined) this.props.timeZone = updates.timeZone;

    this.addUpdatedEvent();
  }

  setTrackingStartDate(date: IsoDate | null): void {
    assertTrackingStartDate(date);
    this.props.trackingStartDate = date;
    this.addUpdatedEvent();
  }

  updateLetterDetails(updates: Partial<LetterDetails>): void {
    const next = { ...this.props.letter };
    for (const key of Object.keys(next) as (keyof LetterDetails)[]) {
      const value = updates[key];
      if (value !== undefined) next[key] = cleanText(value);
    }
    this.props.letter = next;
    this.addUpdatedEvent();
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private addUpdatedEvent(): void {
    this.addEvent({
      eventType: "PropertyMetadataUpdated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    });
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}
