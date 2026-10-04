"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Users } from "lucide-react";

import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";
import { Textarea } from "@moonship/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";
import { PageHeader } from "@moonship/ui/page-header";

import { useTRPC } from "~/trpc/react";

export function TenantsPageContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.tenant.list.queryFilter());
  };

  const create = useMutation(
    trpc.tenant.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Tenant created");
        setOpen(false);
        setFullName("");
        setEmail("");
        setPhone("");
        setNotes("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const archive = useMutation(
    trpc.tenant.archive.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Tenant archived");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tenants"
        description="Operator CRM records (portal invite later)."
        action={
          <Button type="button" onClick={() => setOpen(true)}>
            Add tenant
          </Button>
        }
      />
      {tenants.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          headline="No tenants"
          description="Add your first tenant to get started."
          className="rounded-lg border border-dashed py-16"
        />
      ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell className="font-medium">{tenant.fullName}</TableCell>
              <TableCell>{tenant.email ?? "—"}</TableCell>
              <TableCell>{tenant.phone ?? "—"}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    tenant.status === "active" ? "secondary" : "outline"
                  }
                >
                  {tenant.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {tenant.status === "active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => archive.mutate({ id: tenant.id })}
                  >
                    Archive
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tenant</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                fullName,
                email: email || undefined,
                phone: phone || undefined,
                notes: notes || undefined,
              });
            }}
          >
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
