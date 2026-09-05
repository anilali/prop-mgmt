import type { DomainEvent } from "@moonship/shared";

import type {
  LeaseActivated,
  LeaseCreated,
  LeaseDocumentAttached,
  LeaseEnded,
  LeaseMetadataUpdated,
} from "../events/lease-events";

export type LeaseStatus = "draft" | "active" | "ended";

export interface LeaseDocument {
  storageKey: string;
  fileName: string;
  contentType: string;
  uploadedAt: Date;
}

export interface LeaseProps {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  rentCents: number;
  depositCents?: number;
  status: LeaseStatus;
  document: LeaseDocument | null;
}

function assertInvariants(props: {
  startDate: Date;
  endDate: Date;
  rentCents: number;
}): void {
  if (props.endDate < props.startDate) {
    throw new Error("endDate must be on or after startDate");
  }
  if (props.rentCents < 0) {
    throw new Error("rentCents must be >= 0");
  }
}

export class Lease {
  private props: LeaseProps;
  private events: DomainEvent[] = [];

  private constructor(props: LeaseProps) {
    this.props = props;
  }

  static create(
    props: Omit<LeaseProps, "status" | "document"> & {
      status?: LeaseStatus;
      document?: LeaseDocument | null;
    },
  ): Lease {
    const status = props.status ?? "draft";
    if (status === "ended") {
      throw new Error("Cannot create a lease with status ended");
    }

    assertInvariants(props);

    const lease = new Lease({
      ...props,
      status,
      document: props.document ?? null,
    });
    const event: LeaseCreated = {
      eventType: "LeaseCreated",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        unitId: props.unitId,
        tenantId: props.tenantId,
        status,
      },
    };
    lease.addEvent(event);
    return lease;
  }

  static reconstitute(props: LeaseProps): Lease {
    return new Lease(props);
  }

  get id(): string {
    return this.props.id;
  }

  get unitId(): string {
    return this.props.unitId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get startDate(): Date {
    return this.props.startDate;
  }

  get endDate(): Date {
    return this.props.endDate;
  }

  get rentCents(): number {
    return this.props.rentCents;
  }

  get depositCents(): number | undefined {
    return this.props.depositCents;
  }

  get status(): LeaseStatus {
    return this.props.status;
  }

  get document(): LeaseDocument | null {
    return this.props.document;
  }

  updateMetadata(updates: {
    startDate?: Date;
    endDate?: Date;
    rentCents?: number;
    depositCents?: number | null;
  }): void {
    if (this.props.status === "ended") {
      throw new Error("Cannot update metadata on an ended lease");
    }

    const startDate = updates.startDate ?? this.props.startDate;
    const endDate = updates.endDate ?? this.props.endDate;
    const rentCents = updates.rentCents ?? this.props.rentCents;
    assertInvariants({ startDate, endDate, rentCents });

    if (updates.startDate !== undefined) this.props.startDate = updates.startDate;
    if (updates.endDate !== undefined) this.props.endDate = updates.endDate;
    if (updates.rentCents !== undefined) this.props.rentCents = updates.rentCents;
    if (updates.depositCents !== undefined)
      this.props.depositCents = updates.depositCents ?? undefined;

    const event: LeaseMetadataUpdated = {
      eventType: "LeaseMetadataUpdated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    };
    this.addEvent(event);
  }

  activate(): void {
    if (this.props.status === "active") return;
    if (this.props.status === "ended") {
      throw new Error("Cannot activate an ended lease");
    }

    this.props.status = "active";
    const event: LeaseActivated = {
      eventType: "LeaseActivated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    };
    this.addEvent(event);
  }

  end(): void {
    if (this.props.status === "ended") return;

    this.props.status = "ended";
    const event: LeaseEnded = {
      eventType: "LeaseEnded",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    };
    this.addEvent(event);
  }

  attachDocument(doc: LeaseDocument): void {
    this.props.document = doc;
    const event: LeaseDocumentAttached = {
      eventType: "LeaseDocumentAttached",
      occurredAt: new Date(),
      aggregateId: this.props.id,
      payload: {
        storageKey: doc.storageKey,
        fileName: doc.fileName,
      },
    };
    this.addEvent(event);
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
