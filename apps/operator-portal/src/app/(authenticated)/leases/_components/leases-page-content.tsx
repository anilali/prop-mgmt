"use client";

import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import { useTRPC } from "~/trpc/react";

function dollarsToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

export function LeasesPageContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: leases } = useSuspenseQuery(trpc.lease.list.queryOptions());
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const activeTenants = tenants.filter((t) => t.status === "active");

  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [tenantId, setTenantId] = useState(activeTenants[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rent, setRent] = useState("1500");
  const [deposit, setDeposit] = useState("1500");
  const fileRef = useRef<HTMLInputElement>(null);

  const unitLabel = (id: string) =>
    units.find((u) => u.id === id)?.label ?? id.slice(0, 8);
  const tenantName = (id: string) =>
    tenants.find((t) => t.id === id)?.fullName ?? id.slice(0, 8);

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.lease.list.queryFilter());
  };

  const create = useMutation(
    trpc.lease.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Lease created");
        setOpen(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const activate = useMutation(
    trpc.lease.activate.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Lease activated");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const end = useMutation(
    trpc.lease.end.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Lease ended");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const attach = useMutation(
    trpc.lease.attachDocument.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Document uploaded");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          New lease term
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unit</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Rent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Document</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leases.map((lease) => (
            <TableRow key={lease.id}>
              <TableCell>{unitLabel(lease.unitId)}</TableCell>
              <TableCell>{tenantName(lease.tenantId)}</TableCell>
              <TableCell className="text-xs">
                {lease.startDate.toISOString().slice(0, 10)} →{" "}
                {lease.endDate.toISOString().slice(0, 10)}
              </TableCell>
              <TableCell>${(lease.rentCents / 100).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{lease.status}</Badge>
              </TableCell>
              <TableCell className="text-xs">
                {lease.document ? lease.document.fileName : "—"}
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {lease.status === "draft" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => activate.mutate({ id: lease.id })}
                  >
                    Activate
                  </Button>
                ) : null}
                {lease.status !== "ended" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => end.mutate({ id: lease.id })}
                  >
                    End
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "application/pdf";
                    input.onchange = async () => {
                      const file = input.files?.[0];
                      if (!file) return;
                      const buf = new Uint8Array(await file.arrayBuffer());
                      let binary = "";
                      for (const byte of buf) {
                        binary += String.fromCharCode(byte);
                      }
                      const contentBase64 = btoa(binary);
                      attach.mutate({
                        id: lease.id,
                        fileName: file.name,
                        contentType: "application/pdf",
                        contentBase64,
                      });
                    };
                    input.click();
                  }}
                >
                  Upload PDF
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New lease term</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                unitId,
                tenantId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                rentCents: dollarsToCents(rent),
                depositCents: dollarsToCents(deposit),
                status: "draft",
              });
            }}
          >
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {activeTenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Rent (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Deposit (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create draft
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <input ref={fileRef} type="file" className="hidden" />
    </div>
  );
}
