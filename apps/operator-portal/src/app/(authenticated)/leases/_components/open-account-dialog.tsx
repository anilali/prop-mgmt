"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

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
import { Label } from "@moonship/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

import type { PoolOption } from "../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../_lib/format";
import {
  emptyLeaseForm,
  parseSignedAmount,
  toLeaseInput,
} from "../_lib/lease-form";
import { LeaseFormFields } from "./lease-form-fields";

export function OpenAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Open account</DialogTitle>
          <DialogDescription>
            An account is one tenant in one unit, starting with its first lease.
          </DialogDescription>
        </DialogHeader>
        <OpenAccountForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OpenAccountForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const activeTenants = tenants.filter((t) => t.status === "active");

  const poolsForUnit = (id: string): PoolOption[] =>
    pools
      .filter((pool) => pool.units.some((u) => u.unitId === id))
      .map((pool) => ({ id: pool.id, name: pool.name }));

  const [tenantId, setTenantId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [form, setForm] = useState(() => emptyLeaseForm([]));
  const unitPools = poolsForUnit(unitId);

  const openAccount = useMutation(
    trpc.account.open.mutationOptions({
      onSuccess: async (detail) => {
        await queryClient.invalidateQueries(trpc.account.list.queryFilter());
        toast.success("Account opened");
        onDone();
        router.push(`/leases/${detail.account.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tenantId || !unitId) {
          toast.error("Pick a tenant and a unit");
          return;
        }
        try {
          openAccount.mutate({
            tenantId,
            unitId,
            openingBalanceCents: parseSignedAmount(
              openingBalance,
              "opening balance",
            ),
            lease: toLeaseInput(form, unitPools),
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Check the form");
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Tenant</Label>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a tenant" />
            </SelectTrigger>
            <SelectContent>
              {activeTenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Unit</Label>
          <Select
            value={unitId}
            onValueChange={(id) => {
              setUnitId(id);
              setForm((prev) => ({
                ...prev,
                estimates: emptyLeaseForm(poolsForUnit(id)).estimates,
              }));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a unit" />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1 sm:max-w-xs">
        <Label>Opening balance</Label>
        <Input
          inputMode="decimal"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {property.trackingStartDate
            ? `What the tenant owed at the end of the day before ${formatDate(property.trackingStartDate)}. Enter a prepayment as a negative amount. Only an account that starts on or before that date can have one.`
            : "Set the tracking start date in Setup before entering an opening balance."}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-semibold">First lease</h3>
        {unitId ? (
          <LeaseFormFields
            value={form}
            onChange={setForm}
            pools={unitPools}
            showMoveOut
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Pick a unit to enter the lease.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={openAccount.isPending}>
          Open account
        </Button>
      </DialogFooter>
    </form>
  );
}
