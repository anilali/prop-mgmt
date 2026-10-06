"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import type { IsoDate } from "@moonship/shared";
import { addDays, prorate } from "@moonship/shared";
import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { Chip } from "@moonship/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { Segmented } from "@moonship/ui/segmented";
import { NativeSelect } from "@moonship/ui/select";

import type { AccountSummary, LeaseFormState } from "../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import {
  leaseToForm,
  newestLease,
  newRowKey,
  toLeaseInput,
} from "../_lib/lease-form";
import { nextMonthStart, threeYearsFrom } from "../_lib/lease-terms";
import { centsToInput, formatDate } from "../../_lib/format";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import { addressDraft, AddressFields, toAddress } from "./address-fields";
import { FormField, StepHeading } from "./form-field";

type Who = "new" | "existing";

type Occupancy =
  | { kind: "vacant" }
  | { kind: "taken"; note: string }
  | { kind: "leaving"; note: string }
  | { kind: "ended"; account: AccountSummary; note: string };

function occupancy(unitId: string, accounts: AccountSummary[]): Occupancy {
  const onUnit = accounts.filter((account) => account.unit.id === unitId);
  const taken = onUnit.find(
    (account) =>
      (account.state === "open" || account.state === "upcoming") &&
      newestLease(account.leases)?.moveOutDate === null,
  );
  if (taken) {
    const newest = newestLease(taken.leases);
    return {
      kind: "taken",
      note:
        taken.state === "upcoming"
          ? `${taken.tenant.businessName} from ${formatDate(taken.startDate)}`
          : `${taken.tenant.businessName} until ${formatDate(newest?.endDate)}`,
    };
  }
  const ended = onUnit.find((account) => account.state === "holdover");
  if (ended) {
    return {
      kind: "ended",
      account: ended,
      note: `${ended.tenant.businessName}'s lease ended ${formatDate(newestLease(ended.leases)?.endDate)} with no move-out. Choosing this unit moves them out the day before the new lease starts.`,
    };
  }
  const leaving = onUnit.find(
    (account) => account.state === "open" || account.state === "upcoming",
  );
  if (leaving) {
    return {
      kind: "leaving",
      note: `${leaving.tenant.businessName} moves out ${formatDate(leaving.endDate)}`,
    };
  }
  return { kind: "vacant" };
}

export function NewTenantDialog({
  open,
  initialTenantId,
  onOpenChange,
}: {
  open: boolean;
  initialTenantId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New tenant</DialogTitle>
          <DialogDescription>
            Adds the tenant and opens their account for one unit.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <NewTenantForm
            initialTenantId={initialTenantId}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NewTenantForm({
  initialTenantId,
  onDone,
}: {
  initialTenantId: string | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: years } = useQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  const lastFinalized =
    years?.years.find((year) => year.status === "finalized")?.year ?? null;
  const { data: workspace } = useQuery(
    trpc.reconciliation.workspace.queryOptions(
      lastFinalized === null ? skipToken : { year: lastFinalized },
    ),
  );

  const activeTenants = tenants
    .filter((tenant) => tenant.status === "active")
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
  const sortedUnits = [...units].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  const today = accountList.today;

  const [who, setWho] = useState<Who>(initialTenantId ? "existing" : "new");
  const [tenantId, setTenantId] = useState(
    initialTenantId ?? activeTenants[0]?.id ?? "",
  );
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(() => addressDraft(null));
  const [unitId, setUnitId] = useState("");
  const [startDate, setStartDate] = useState<IsoDate>(nextMonthStart(today));
  const [endDate, setEndDate] = useState<IsoDate>(
    threeYearsFrom(nextMonthStart(today)),
  );
  const [rent, setRent] = useState("");
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [lateFee, setLateFee] = useState("");
  const [lateFeeDay, setLateFeeDay] = useState("");
  const [insurance, setInsurance] = useState("");
  const [saving, setSaving] = useState(false);
  const createdTenantId = useRef<string | null>(null);
  const movedOut = useRef(new Set<string>());

  const createTenant = useMutation(trpc.tenant.create.mutationOptions());
  const updateLease = useMutation(trpc.lease.update.mutationOptions());
  const openAccount = useMutation(trpc.account.open.mutationOptions());

  const unit = units.find((u) => u.id === unitId);
  const unitPools = pools
    .filter((pool) => pool.units.some((u) => u.unitId === unitId))
    .map((pool) => {
      const row = pool.units.find((u) => u.unitId === unitId);
      const actual = workspace?.pools.find((p) => p.poolId === pool.id);
      const suggested =
        actual && row && pool.totalSqft > 0 && actual.actualCents > 0
          ? prorate(actual.actualCents, [row.sqft], [pool.totalSqft, 12])
          : null;
      return { id: pool.id, name: pool.name, suggested };
    });
  const hasSuggestions = unitPools.some((pool) => pool.suggested !== null);
  const estimateText = (poolId: string, suggested: number | null) =>
    estimates[poolId] ?? (suggested === null ? "" : centsToInput(suggested));

  const buildLease = () => {
    const form: LeaseFormState = {
      startDate,
      endDate,
      moveOutDate: "",
      rentSteps: [{ key: newRowKey(), startsOn: startDate, amount: rent }],
      estimates: Object.fromEntries(
        unitPools.map((pool) => {
          const amount = estimateText(pool.id, pool.suggested).trim();
          return [
            pool.id,
            {
              pays: amount !== "" && !/^0+(\.0+)?$/.test(amount),
              steps: [{ key: newRowKey(), startsOn: startDate, amount }],
            },
          ];
        }),
      ),
      fixedCharges: [],
      hasLateFee: lateFee.trim() !== "",
      lateFeeAmount: lateFee,
      lateFeeDay,
      insuranceExpiresOn: insurance,
    };
    return toLeaseInput(form, unitPools);
  };

  const submit = async () => {
    if (who === "new" && businessName.trim() === "") {
      toast.error("Enter the business name");
      return;
    }
    if (who === "existing" && !tenantId) {
      toast.error("Pick a tenant");
      return;
    }
    if (!unit) {
      toast.error("Pick a unit");
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      toast.error("The lease has to end after it starts");
      return;
    }
    if (rent.trim() === "") {
      toast.error("Enter the base rent");
      return;
    }
    let lease: ReturnType<typeof buildLease>;
    let mailingAddress: ReturnType<typeof toAddress> = null;
    try {
      lease = buildLease();
      if (who === "new") mailingAddress = toAddress(address);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check the form");
      return;
    }

    const place = occupancy(unit.id, accountList.accounts);
    setSaving(true);
    try {
      let id = who === "existing" ? tenantId : createdTenantId.current;
      if (id === null) {
        const created = await createTenant.mutateAsync({
          businessName: businessName.trim(),
          contactName: contactName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          mailingAddress: mailingAddress ?? undefined,
        });
        if (!created) throw new Error("The tenant could not be created");
        id = created.id;
        createdTenantId.current = id;
        await queryClient.invalidateQueries(trpc.tenant.pathFilter());
      }

      let movedOutNote = "";
      if (place.kind === "ended" && !movedOut.current.has(place.account.id)) {
        const previous = newestLease(place.account.leases);
        if (previous) {
          const moveOutDate = addDays(startDate, -1);
          await updateLease.mutateAsync({
            accountId: place.account.id,
            expectedVersion: place.account.version,
            leaseId: previous.id,
            lease: toLeaseInput(
              { ...leaseToForm(previous, unitPools), moveOutDate },
              unitPools,
            ),
          });
          movedOut.current.add(place.account.id);
          movedOutNote = `. ${place.account.tenant.businessName} moved out ${formatDate(moveOutDate)}`;
        }
      }

      const detail = await openAccount.mutateAsync({
        tenantId: id,
        unitId: unit.id,
        openingBalanceCents: 0,
        lease,
      });
      await Promise.all([
        queryClient.invalidateQueries(trpc.account.pathFilter()),
        queryClient.invalidateQueries(trpc.tenant.pathFilter()),
        ledgerChanged(),
      ]);
      toast.success(
        `Added ${detail.account.tenant.businessName} · ${detail.account.unit.label}${movedOutNote}`,
      );
      onDone();
      router.push(`/tenants/${detail.account.id}?tab=lease`);
    } catch (err) {
      await queryClient.invalidateQueries(trpc.account.list.queryFilter());
      toast.error(err instanceof Error ? err.message : "Could not add tenant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <StepHeading number={1}>Who</StepHeading>
      <Segmented<Who>
        aria-label="Tenant"
        value={who}
        onValueChange={setWho}
        options={[
          { value: "new", label: "New tenant" },
          {
            value: "existing",
            label: "Existing tenant, another unit",
            disabled: activeTenants.length === 0,
          },
        ]}
        className="self-start"
      />
      {who === "new" ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <FormField label="Business name">
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoFocus
              />
            </FormField>
            <FormField label="Contact name">
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
          </div>
          <div className="flex flex-col gap-[5px]">
            <span className="text-fg-2 text-[12px] font-medium">
              Mailing address
            </span>
            <AddressFields value={address} onChange={setAddress} />
            <small className="text-fg-3 text-[11.5px]">
              Printed on the year-end letter. You can add it later, but it
              blocks finalizing.
            </small>
          </div>
        </div>
      ) : (
        <FormField label="Tenant">
          <NativeSelect
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            {activeTenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.businessName}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}

      <StepHeading number={2}>Unit</StepHeading>
      <div className="flex flex-col gap-1.5" role="radiogroup">
        {sortedUnits.map((option) => {
          const place = occupancy(option.id, accountList.accounts);
          const disabled = place.kind === "taken";
          const poolNames = pools
            .filter((pool) => pool.units.some((u) => u.unitId === option.id))
            .map((pool) => pool.name)
            .join(", ");
          return (
            <label
              key={option.id}
              className={cn(
                "border-line-2 hover:border-line-3 grid cursor-pointer grid-cols-[16px_56px_minmax(0,1fr)] items-center gap-2.5 rounded-[7px] border px-2.5 py-2 transition-colors",
                "has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="new-tenant-unit"
                value={option.id}
                checked={unitId === option.id}
                disabled={disabled}
                onChange={() => {
                  setUnitId(option.id);
                  setEstimates({});
                }}
                className="accent-primary size-[15px]"
              />
              <Chip className="justify-center">{option.label}</Chip>
              <span className="min-w-0">
                <span>
                  {option.sqft.toLocaleString()} sqft
                  {poolNames ? ` · ${poolNames}` : ""}
                </span>
                <span
                  className={cn(
                    "block text-[11.5px]",
                    place.kind === "ended" ? "text-red" : "text-fg-3",
                  )}
                >
                  {place.kind === "vacant" ? "Vacant" : place.note}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <StepHeading number={3}>Lease</StepHeading>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Starts">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Ends">
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </FormField>
      </div>
      <FormField label="Base rent a month">
        <Input
          inputMode="decimal"
          placeholder="0.00"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
        />
      </FormField>
      <div className="flex flex-col gap-[5px]">
        <span className="text-fg-2 text-[12px] font-medium">
          Monthly estimates
        </span>
        {!unit ? (
          <span className="text-fg-3 text-[11.5px]">
            Pick a unit to see its pools.
          </span>
        ) : unitPools.length === 0 ? (
          <span className="text-fg-3 text-[11.5px]">
            This unit is not in any pool.
          </span>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
              {unitPools.map((pool) => (
                <FormField key={pool.id} label={pool.name}>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={estimateText(pool.id, pool.suggested)}
                    onChange={(e) =>
                      setEstimates((prev) => ({
                        ...prev,
                        [pool.id]: e.target.value,
                      }))
                    }
                  />
                </FormField>
              ))}
            </div>
            {hasSuggestions && lastFinalized !== null ? (
              <small className="text-fg-3 text-[11.5px]">
                Suggested from {lastFinalized} costs and the unit&apos;s share.
              </small>
            ) : null}
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FormField label="Late fee (optional)">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={lateFee}
            onChange={(e) => setLateFee(e.target.value)}
          />
        </FormField>
        <FormField label="Charged after day">
          <Input
            inputMode="numeric"
            placeholder="5"
            value={lateFeeDay}
            onChange={(e) => setLateFeeDay(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Insurance certificate expires (optional)">
        <Input
          type="date"
          value={insurance}
          onChange={(e) => setInsurance(e.target.value)}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          Add tenant
        </Button>
      </DialogFooter>
    </form>
  );
}
