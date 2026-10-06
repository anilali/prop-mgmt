"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type { IsoDate } from "@moonship/shared";
import { addDays, parseCents } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { formatMoney } from "@moonship/ui/money";

import type { AccountSummary, Lease, PoolOption } from "../../_lib/lease-form";
import { FormField } from "../../_components/form-field";
import {
  addIncrease,
  leaseToForm,
  newestLease,
  renewalForm,
  withStartDate,
} from "../../_lib/lease-form";
import {
  amountOn,
  chargeChanges,
  chargeNamesOf,
  coveringLease,
  currentLease,
  nextAnniversary,
  nextMonthStart,
  threeYearsFrom,
} from "../../_lib/lease-terms";
import { centsToInput, formatDate } from "../../../_lib/format";
import { useLeaseChange } from "./use-lease-change";

export type LeaseAction =
  | { kind: "moveout" }
  | { kind: "renew" }
  | { kind: "increase" }
  | { kind: "insurance" }
  | { kind: "charge-add" }
  | { kind: "charge-change"; name: string }
  | { kind: "charge-stop"; name: string };

interface ActionProps {
  account: AccountSummary;
  pools: readonly PoolOption[];
  today: IsoDate;
  onDone: () => void;
}

function cents(text: string, label: string): number | null {
  try {
    const value = parseCents(text);
    if (value < 0) throw new Error();
    return value;
  } catch {
    toast.error(`Enter a valid amount for the ${label}`);
    return null;
  }
}

function Footer({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={pending}>
        {label}
      </Button>
    </DialogFooter>
  );
}

function titleFor(action: LeaseAction): string {
  switch (action.kind) {
    case "moveout":
      return "Set move-out date";
    case "renew":
      return "Add renewal";
    case "increase":
      return "Add rent increase";
    case "insurance":
      return "Insurance certificate";
    case "charge-add":
      return "Add fixed charge";
    case "charge-change":
      return `Change ${action.name}`;
    case "charge-stop":
      return `Stop ${action.name}`;
  }
}

function descriptionFor(
  action: LeaseAction,
  account: AccountSummary,
  today: IsoDate,
): ReactNode {
  const name = `${account.tenant.businessName} · ${account.unit.label}`;
  const lease = currentLease(account.leases, today);
  switch (action.kind) {
    case "moveout":
      return `${name} stops expecting rent after this date.`;
    case "renew":
      return `A new lease on ${name}. Estimates and fixed charges carry over.`;
    case "increase": {
      const last = lease?.rentSteps[lease.rentSteps.length - 1];
      return last
        ? `Base rent for ${name} is ${formatMoney(last.amountCents)} from ${formatDate(last.startsOn)}.`
        : null;
    }
    case "insurance":
      return `When ${name}'s current certificate expires.`;
    case "charge-add":
      return `A monthly extra on ${name}. It counts in rent and the balance, but not in the reconciliation.`;
    case "charge-change": {
      const amount = lease
        ? amountOn(
            lease.fixedChargeSteps.filter((s) => s.name === action.name),
            today,
          )
        : 0;
      return `Currently ${formatMoney(amount)} a month on ${name}.`;
    }
    case "charge-stop":
      return `No more ${action.name.toLowerCase()} on ${name} from this date. Earlier months keep it.`;
  }
}

export function LeaseActionDialog({
  action,
  account,
  pools,
  today,
  onClose,
}: {
  action: LeaseAction | null;
  account: AccountSummary;
  pools: readonly PoolOption[];
  today: IsoDate;
  onClose: () => void;
}) {
  const props: ActionProps = { account, pools, today, onDone: onClose };
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {action ? (
          <>
            <DialogHeader>
              <DialogTitle>{titleFor(action)}</DialogTitle>
              <DialogDescription>
                {descriptionFor(action, account, today)}
              </DialogDescription>
            </DialogHeader>
            {action.kind === "moveout" ? <MoveOutForm {...props} /> : null}
            {action.kind === "renew" ? <RenewalForm {...props} /> : null}
            {action.kind === "increase" ? <IncreaseForm {...props} /> : null}
            {action.kind === "insurance" ? <InsuranceForm {...props} /> : null}
            {action.kind === "charge-add" ? <ChargeAddForm {...props} /> : null}
            {action.kind === "charge-change" ? (
              <ChargeStepForm {...props} name={action.name} stop={false} />
            ) : null}
            {action.kind === "charge-stop" ? (
              <ChargeStepForm {...props} name={action.name} stop />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveOutForm({ account, pools, today, onDone }: ActionProps) {
  const change = useLeaseChange(account.id, account.version, pools);
  const newest = newestLease(account.leases);
  const [date, setDate] = useState<IsoDate>(
    newest && newest.endDate >= today ? newest.endDate : today,
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!newest) return;
        void change
          .save([
            {
              lease: newest,
              form: { ...leaseToForm(newest, pools), moveOutDate: date },
            },
          ])
          .then((ok) => {
            if (!ok) return;
            toast.success(`Move-out set to ${formatDate(date)}`);
            onDone();
          });
      }}
    >
      <FormField label="Move-out date">
        <Input
          type="date"
          value={date}
          min={newest?.startDate}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </FormField>
      <Footer pending={change.pending} label="Set move-out" onCancel={onDone} />
    </form>
  );
}

function RenewalForm({ account, pools, today, onDone }: ActionProps) {
  const change = useLeaseChange(account.id, account.version, pools);
  const newest = newestLease(account.leases);
  const initialStart = newest ? addDays(newest.endDate, 1) : today;
  const [start, setStart] = useState<IsoDate>(initialStart);
  const [end, setEnd] = useState<IsoDate>(threeYearsFrom(initialStart));
  const currentRent = newest
    ? (newest.rentSteps[newest.rentSteps.length - 1]?.amountCents ?? 0)
    : 0;
  const [rent, setRent] = useState(centsToInput(currentRent));

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!newest) return;
        if (end <= start) {
          toast.error("The end date has to be after the start date");
          return;
        }
        const base = withStartDate(renewalForm(newest, pools), start);
        const form = {
          ...base,
          endDate: end,
          rentSteps: base.rentSteps.map((step, index) =>
            index === 0 ? { ...step, amount: rent } : step,
          ),
        };
        void change.addLease(form).then((ok) => {
          if (!ok) return;
          toast.success(`Renewal added through ${formatDate(end)}`);
          onDone();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Starts">
          <Input
            type="date"
            value={start}
            min={initialStart}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Ends">
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </FormField>
      </div>
      <FormField
        label="Base rent"
        hint={`Currently ${formatMoney(currentRent)}.`}
      >
        <Input
          inputMode="decimal"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          required
        />
      </FormField>
      <Footer pending={change.pending} label="Add renewal" onCancel={onDone} />
    </form>
  );
}

function IncreaseForm({ account, pools, today, onDone }: ActionProps) {
  const change = useLeaseChange(account.id, account.version, pools);
  const lease = currentLease(account.leases, today);
  const [date, setDate] = useState<IsoDate>(
    lease ? nextAnniversary(lease.startDate, today) : today,
  );
  const [percent, setPercent] = useState("3");
  const [amount, setAmount] = useState("");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const target = coveringLease(account.leases, date);
        if (!target) {
          toast.error("Pick a date during a lease on this account");
          return;
        }
        const form = leaseToForm(target, pools);
        let rentSteps: typeof form.rentSteps;
        try {
          rentSteps =
            amount.trim() !== ""
              ? addIncrease(form, date, "amount", amount)
              : addIncrease(form, date, "percent", percent);
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Check the increase",
          );
          return;
        }
        const added = rentSteps.find((step) => step.startsOn === date);
        void change
          .save([{ lease: target, form: { ...form, rentSteps } }])
          .then((ok) => {
            if (!ok) return;
            toast.success(
              added
                ? `Base rent goes to ${formatMoney(parseCents(added.amount))} on ${formatDate(date)}`
                : "Increase added",
            );
            onDone();
          });
      }}
    >
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Starts">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Increase by %">
          <Input
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </FormField>
      </div>
      <FormField
        label="Or new amount"
        hint="A new amount wins over the percentage."
      >
        <Input
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </FormField>
      <Footer pending={change.pending} label="Add increase" onCancel={onDone} />
    </form>
  );
}

function InsuranceForm({ account, pools, today, onDone }: ActionProps) {
  const change = useLeaseChange(account.id, account.version, pools);
  const lease = currentLease(account.leases, today);
  const [date, setDate] = useState<IsoDate>(lease?.insuranceExpiresOn ?? "");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!lease) return;
        void change
          .save([
            {
              lease,
              form: { ...leaseToForm(lease, pools), insuranceExpiresOn: date },
            },
          ])
          .then((ok) => {
            if (!ok) return;
            toast.success("Insurance date saved");
            onDone();
          });
      }}
    >
      <FormField label="Expires on">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </FormField>
      <Footer pending={change.pending} label="Save" onCancel={onDone} />
    </form>
  );
}

function existingCharge(lease: Lease | undefined, name: string) {
  const key = name.trim().toLowerCase();
  return lease
    ? chargeNamesOf(lease).find((n) => n.toLowerCase() === key)
    : undefined;
}

function ChargeAddForm({ account, pools, today, onDone }: ActionProps) {
  const change = useLeaseChange(account.id, account.version, pools);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<IsoDate>(nextMonthStart(today));

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
          toast.error("Enter a name");
          return;
        }
        const clash = existingCharge(
          coveringLease(account.leases, from),
          trimmed,
        );
        if (clash) {
          toast.error(`${clash} is already a charge. Use Change instead.`);
          return;
        }
        const value = cents(amount, trimmed);
        if (value === null) return;
        if (value === 0) {
          toast.error("Enter an amount above 0");
          return;
        }
        let changes: ReturnType<typeof chargeChanges>;
        try {
          changes = chargeChanges(account.leases, pools, trimmed, from, value);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the date");
          return;
        }
        void change.save(changes).then((ok) => {
          if (!ok) return;
          toast.success(
            `${trimmed} added: ${formatMoney(value)} a month from ${formatDate(from)}`,
          );
          onDone();
        });
      }}
    >
      <FormField label="Name">
        <Input
          list="fixed-charge-names"
          placeholder="Sign rent"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <datalist id="fixed-charge-names">
          <option value="Sign rent" />
          <option value="Trash" />
          <option value="Parking" />
          <option value="Storage" />
        </datalist>
      </FormField>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Amount a month">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Starts">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </FormField>
      </div>
      <Footer pending={change.pending} label="Add charge" onCancel={onDone} />
    </form>
  );
}

function ChargeStepForm({
  account,
  pools,
  today,
  onDone,
  name,
  stop,
}: ActionProps & { name: string; stop: boolean }) {
  const change = useLeaseChange(account.id, account.version, pools);
  const lease = currentLease(account.leases, today);
  const current = lease
    ? amountOn(
        lease.fixedChargeSteps.filter((s) => s.name === name),
        today,
      )
    : 0;
  const [amount, setAmount] = useState(centsToInput(current));
  const [from, setFrom] = useState<IsoDate>(nextMonthStart(today));

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const value = stop ? 0 : cents(amount, name);
        if (value === null) return;
        let changes: ReturnType<typeof chargeChanges>;
        try {
          changes = chargeChanges(account.leases, pools, name, from, value);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the date");
          return;
        }
        void change.save(changes).then((ok) => {
          if (!ok) return;
          toast.success(
            value === 0
              ? `${name} stops ${formatDate(from)}`
              : `${name} is ${formatMoney(value)} from ${formatDate(from)}`,
          );
          onDone();
        });
      }}
    >
      <div
        className={
          stop ? "grid gap-3" : "grid grid-cols-2 gap-3 max-sm:grid-cols-1"
        }
      >
        {stop ? null : (
          <FormField label="New amount a month">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>
        )}
        <FormField
          label={stop ? "Stops on" : "From"}
          hint={stop ? "Pick the first day it no longer applies." : undefined}
        >
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </FormField>
      </div>
      <Footer
        pending={change.pending}
        label={stop ? "Stop charge" : "Save"}
        onCancel={onDone}
      />
    </form>
  );
}
