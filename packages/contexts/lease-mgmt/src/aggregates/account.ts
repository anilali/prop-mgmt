import type { DomainEvent, IsoDate } from "@moonship/shared";
import { isIsoDate } from "@moonship/shared";

import type {
  AccountOpened,
  LeaseAdded,
  LeaseRemoved,
  LeaseUpdated,
} from "../events/account-events";

export interface LateFee {
  amountCents: number;
  day: number;
}

export interface RentStep {
  id: string;
  startsOn: IsoDate;
  amountCents: number;
  tenantNotifiedAt: Date | null;
}

export interface EstimateStep {
  id: string;
  poolId: string;
  startsOn: IsoDate;
  amountCents: number;
}

export interface FixedChargeStep {
  id: string;
  name: string;
  startsOn: IsoDate;
  amountCents: number;
}

export const FIXED_CHARGE_NAME_MAX_LENGTH = 40;

export interface Lease {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
  moveOutDate: IsoDate | null;
  lateFee: LateFee | null;
  insuranceExpiresOn: IsoDate | null;
  rentSteps: RentStep[];
  estimateSteps: EstimateStep[];
  fixedChargeSteps: FixedChargeStep[];
}

export interface LeaseTermsInput {
  startDate: IsoDate;
  endDate: IsoDate;
  moveOutDate: IsoDate | null;
  lateFee: LateFee | null;
  insuranceExpiresOn: IsoDate | null;
  rentSteps: { id: string; startsOn: IsoDate; amountCents: number }[];
  estimateSteps: {
    id: string;
    poolId: string;
    startsOn: IsoDate;
    amountCents: number;
  }[];
  fixedChargeSteps: FixedChargeStep[];
}

export type NewLease = LeaseTermsInput & { id: string };

export interface AccountProps {
  id: string;
  propertyId: string;
  tenantId: string;
  unitId: string;
  openingBalanceCents: number;
  version: number;
  leases: Lease[];
}

export class StaleAccountError extends Error {
  constructor() {
    super("This account changed since you opened it. Reload and try again.");
    this.name = "StaleAccountError";
  }
}

function copyLease(lease: Lease): Lease {
  return {
    ...lease,
    lateFee: lease.lateFee ? { ...lease.lateFee } : null,
    rentSteps: lease.rentSteps.map((step) => ({ ...step })),
    estimateSteps: lease.estimateSteps.map((step) => ({ ...step })),
    fixedChargeSteps: lease.fixedChargeSteps.map((step) => ({ ...step })),
  };
}

function byStartDate(a: Lease, b: Lease): number {
  return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertDate(value: IsoDate, field: string): void {
  if (!isIsoDate(value)) {
    throw new Error(`${field} must be a date`);
  }
}

function assertAmount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a whole number of cents >= 0`);
  }
}

function assertLease(lease: Lease): void {
  assertDate(lease.startDate, "startDate");
  assertDate(lease.endDate, "endDate");
  if (lease.endDate < lease.startDate) {
    throw new Error("endDate must be on or after startDate");
  }
  if (lease.moveOutDate !== null) {
    assertDate(lease.moveOutDate, "moveOutDate");
    if (lease.moveOutDate < lease.startDate) {
      throw new Error("moveOutDate must be on or after startDate");
    }
  }
  if (lease.insuranceExpiresOn !== null) {
    assertDate(lease.insuranceExpiresOn, "insuranceExpiresOn");
  }

  const firstRentStep = lease.rentSteps[0];
  if (!firstRentStep) {
    throw new Error("A lease needs at least one base rent step");
  }
  if (firstRentStep.startsOn !== lease.startDate) {
    throw new Error(
      "The first base rent step must start on the lease start date",
    );
  }
  const rentDates = new Set<string>();
  for (const step of lease.rentSteps) {
    assertDate(step.startsOn, "Base rent step date");
    assertAmount(step.amountCents, "Base rent");
    if (rentDates.has(step.startsOn)) {
      throw new Error(`Two base rent steps start on ${step.startsOn}`);
    }
    rentDates.add(step.startsOn);
  }

  const estimateDates = new Set<string>();
  for (const step of lease.estimateSteps) {
    assertDate(step.startsOn, "Estimate step date");
    assertAmount(step.amountCents, "Estimate");
    if (step.startsOn < lease.startDate) {
      throw new Error(
        "Estimate steps must start on or after the lease start date",
      );
    }
    const key = `${step.poolId}|${step.startsOn}`;
    if (estimateDates.has(key)) {
      throw new Error(
        `Two estimate steps for one pool start on ${step.startsOn}`,
      );
    }
    estimateDates.add(key);
  }

  const chargeDates = new Set<string>();
  const chargeNames = new Map<string, string>();
  for (const step of lease.fixedChargeSteps) {
    if (step.name.trim() === "") {
      throw new Error("Each fixed charge needs a name");
    }
    if (step.name.length > FIXED_CHARGE_NAME_MAX_LENGTH) {
      throw new Error(
        `Fixed charge names can be at most ${FIXED_CHARGE_NAME_MAX_LENGTH} characters`,
      );
    }
    const nameKey = step.name.toLowerCase();
    const knownName = chargeNames.get(nameKey);
    if (knownName !== undefined && knownName !== step.name) {
      throw new Error(`Two fixed charges are named ${step.name}`);
    }
    chargeNames.set(nameKey, step.name);
    assertDate(step.startsOn, "Fixed charge step date");
    assertAmount(step.amountCents, step.name);
    if (step.startsOn < lease.startDate) {
      throw new Error(
        "Fixed charge steps must start on or after the lease start date",
      );
    }
    const key = `${nameKey}|${step.startsOn}`;
    if (chargeDates.has(key)) {
      throw new Error(`Two ${step.name} steps start on ${step.startsOn}`);
    }
    chargeDates.add(key);
  }

  const stepIds = [
    ...lease.rentSteps.map((s) => s.id),
    ...lease.estimateSteps.map((s) => s.id),
    ...lease.fixedChargeSteps.map((s) => s.id),
  ];
  if (new Set(stepIds).size !== stepIds.length) {
    throw new Error("Step ids must be unique");
  }

  if (lease.lateFee !== null) {
    const { amountCents, day } = lease.lateFee;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new Error("Late fee amount must be above 0");
    }
    if (!Number.isInteger(day) || day < 1 || day > 27) {
      throw new Error("Late fee day must be between 1 and 27");
    }
  }
}

function assertLeases(leases: Lease[]): void {
  if (leases.length === 0) {
    throw new Error("An account needs at least one lease");
  }
  for (const lease of leases) {
    assertLease(lease);
  }
  for (let i = 1; i < leases.length; i++) {
    const previous = leases[i - 1];
    const current = leases[i];
    if (previous && current && current.startDate <= previous.endDate) {
      throw new Error("Leases on one account cannot overlap");
    }
  }
  for (let i = 0; i < leases.length - 1; i++) {
    if (leases[i]?.moveOutDate) {
      throw new Error(
        "Only the newest lease can have a move-out date. A tenant who comes back needs a new account.",
      );
    }
  }
}

function assertOpeningBalance(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Opening balance must be a whole number of cents");
  }
}

function buildLease(
  id: string,
  terms: LeaseTermsInput,
  existing?: Lease,
): Lease {
  const inputRentSteps = [...terms.rentSteps].sort((a, b) =>
    compareText(a.startsOn, b.startsOn),
  );
  const earliest = inputRentSteps[0];
  if (
    existing &&
    earliest &&
    terms.startDate !== existing.startDate &&
    earliest.startsOn === existing.startDate
  ) {
    inputRentSteps[0] = { ...earliest, startsOn: terms.startDate };
  }

  const previousSteps = existing?.rentSteps ?? [];
  const matched = new Map<number, RentStep>();
  const used = new Set<string>();
  inputRentSteps.forEach((step, index) => {
    const byId = previousSteps.find((p) => p.id === step.id);
    if (byId) {
      matched.set(index, byId);
      used.add(byId.id);
    }
  });
  inputRentSteps.forEach((step, index) => {
    if (matched.has(index)) return;
    const byDate = previousSteps.find(
      (p) => !used.has(p.id) && p.startsOn === step.startsOn,
    );
    if (byDate) {
      matched.set(index, byDate);
      used.add(byDate.id);
    }
  });

  const rentSteps: RentStep[] = inputRentSteps
    .map((step, index) => {
      const previous = matched.get(index);
      const unchanged =
        previous?.startsOn === step.startsOn &&
        previous.amountCents === step.amountCents;
      return {
        id: previous?.id ?? step.id,
        startsOn: step.startsOn,
        amountCents: step.amountCents,
        tenantNotifiedAt: unchanged ? previous.tenantNotifiedAt : null,
      };
    })
    .sort((a, b) => compareText(a.startsOn, b.startsOn));

  const previousEstimates = existing?.estimateSteps ?? [];
  const estimateSteps: EstimateStep[] = terms.estimateSteps
    .map((step) => {
      const previous = previousEstimates.find(
        (p) => p.poolId === step.poolId && p.startsOn === step.startsOn,
      );
      return {
        id: previous?.id ?? step.id,
        poolId: step.poolId,
        startsOn: step.startsOn,
        amountCents: step.amountCents,
      };
    })
    .sort(
      (a, b) =>
        compareText(a.startsOn, b.startsOn) || compareText(a.poolId, b.poolId),
    );

  const fixedChargeSteps: FixedChargeStep[] = terms.fixedChargeSteps
    .map((step) => ({
      id: step.id,
      name: step.name.trim(),
      startsOn: step.startsOn,
      amountCents: step.amountCents,
    }))
    .sort(
      (a, b) =>
        compareText(a.name.toLowerCase(), b.name.toLowerCase()) ||
        compareText(a.startsOn, b.startsOn),
    );

  return {
    id,
    startDate: terms.startDate,
    endDate: terms.endDate,
    moveOutDate: terms.moveOutDate,
    lateFee: terms.lateFee ? { ...terms.lateFee } : null,
    insuranceExpiresOn: terms.insuranceExpiresOn,
    rentSteps,
    estimateSteps,
    fixedChargeSteps,
  };
}

export class Account {
  private props: AccountProps;
  private events: DomainEvent[] = [];

  private constructor(props: AccountProps) {
    this.props = props;
  }

  static open(
    props: Omit<AccountProps, "leases" | "version">,
    firstLease: NewLease,
  ): Account {
    assertOpeningBalance(props.openingBalanceCents);
    const leases = [buildLease(firstLease.id, firstLease)];
    assertLeases(leases);
    const account = new Account({ ...props, version: 0, leases });
    const event: AccountOpened = {
      eventType: "AccountOpened",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        propertyId: props.propertyId,
        tenantId: props.tenantId,
        unitId: props.unitId,
      },
    };
    account.addEvent(event);
    account.addLeaseEvent("LeaseAdded", firstLease.id);
    return account;
  }

  static reconstitute(props: AccountProps): Account {
    return new Account({
      ...props,
      leases: props.leases.map(copyLease).sort(byStartDate),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get unitId(): string {
    return this.props.unitId;
  }

  get openingBalanceCents(): number {
    return this.props.openingBalanceCents;
  }

  get version(): number {
    return this.props.version;
  }

  get leases(): Lease[] {
    return this.props.leases.map(copyLease);
  }

  assertVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new StaleAccountError();
    }
  }

  markSaved(): void {
    this.props.version += 1;
  }

  findLease(leaseId: string): Lease | null {
    const lease = this.props.leases.find((l) => l.id === leaseId);
    return lease ? copyLease(lease) : null;
  }

  setOpeningBalance(cents: number): void {
    assertOpeningBalance(cents);
    this.props.openingBalanceCents = cents;
  }

  addLease(lease: NewLease): void {
    if (this.props.leases.some((l) => l.id === lease.id)) {
      throw new Error(`Lease ${lease.id} already exists`);
    }
    this.replaceLeases([...this.props.leases, buildLease(lease.id, lease)]);
    this.addLeaseEvent("LeaseAdded", lease.id);
  }

  updateLease(leaseId: string, terms: LeaseTermsInput): void {
    const existing = this.requireLease(leaseId);
    const updated = buildLease(leaseId, terms, existing);
    this.replaceLeases(
      this.props.leases.map((l) => (l.id === leaseId ? updated : l)),
    );
    this.addLeaseEvent("LeaseUpdated", leaseId);
  }

  removeLease(leaseId: string): void {
    this.requireLease(leaseId);
    if (this.props.leases.length === 1) {
      throw new Error("An account needs at least one lease");
    }
    this.replaceLeases(this.props.leases.filter((l) => l.id !== leaseId));
    this.addLeaseEvent("LeaseRemoved", leaseId);
  }

  setEstimateStep(
    leaseId: string,
    poolId: string,
    startsOn: IsoDate,
    amountCents: number,
    newStepId: string,
  ): void {
    const lease = this.requireLease(leaseId);
    const existing = lease.estimateSteps.find(
      (s) => s.poolId === poolId && s.startsOn === startsOn,
    );
    const estimateSteps = existing
      ? lease.estimateSteps.map((s) =>
          s === existing ? { ...s, amountCents } : s,
        )
      : [
          ...lease.estimateSteps,
          { id: newStepId, poolId, startsOn, amountCents },
        ];
    const updated: Lease = {
      ...copyLease(lease),
      estimateSteps: estimateSteps
        .map((s) => ({ ...s }))
        .sort(
          (a, b) =>
            compareText(a.startsOn, b.startsOn) ||
            compareText(a.poolId, b.poolId),
        ),
    };
    this.replaceLeases(
      this.props.leases.map((l) => (l.id === leaseId ? updated : l)),
    );
    this.addLeaseEvent("LeaseUpdated", leaseId);
  }

  markRentStepNotified(leaseId: string, stepId: string, at: Date | null): void {
    const lease = this.requireLease(leaseId);
    if (!lease.rentSteps.some((s) => s.id === stepId)) {
      throw new Error(`Base rent step not found: ${stepId}`);
    }
    const updated: Lease = {
      ...copyLease(lease),
      rentSteps: lease.rentSteps.map((s) =>
        s.id === stepId ? { ...s, tenantNotifiedAt: at } : { ...s },
      ),
    };
    this.props.leases = this.props.leases.map((l) =>
      l.id === leaseId ? updated : l,
    );
    this.addLeaseEvent("LeaseUpdated", leaseId);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private requireLease(leaseId: string): Lease {
    const lease = this.props.leases.find((l) => l.id === leaseId);
    if (!lease) {
      throw new Error(`Lease not found: ${leaseId}`);
    }
    return lease;
  }

  private replaceLeases(leases: Lease[]): void {
    const sorted = [...leases].sort(byStartDate);
    assertLeases(sorted);
    this.props.leases = sorted;
  }

  private addLeaseEvent(
    eventType: "LeaseAdded" | "LeaseUpdated" | "LeaseRemoved",
    leaseId: string,
  ): void {
    const event: LeaseAdded | LeaseUpdated | LeaseRemoved = {
      eventType,
      occurredAt: new Date(),
      aggregateId: this.props.id,
      payload: { leaseId },
    };
    this.addEvent(event);
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}
