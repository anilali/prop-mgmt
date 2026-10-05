"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import { PageHeader } from "@moonship/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { TenantView } from "./tenant-dialog";
import { useTRPC } from "~/trpc/react";
import { TenantDialog } from "./tenant-dialog";

export function TenantsPageContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: tenants } = useSuspenseQuery(trpc.tenant.list.queryOptions());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TenantView | null>(null);

  const sorted = [...tenants].sort((a, b) =>
    a.businessName.localeCompare(b.businessName),
  );

  const archive = useMutation(
    trpc.tenant.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.tenant.list.queryFilter());
        toast.success("Tenant archived");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const openDialog = (tenant: TenantView | null) => {
    setEditing(tenant);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tenants"
        description="The businesses that rent units. Letters go to the mailing address."
        action={
          <Button type="button" onClick={() => openDialog(null)}>
            Add tenant
          </Button>
        }
      />
      {sorted.length === 0 ? (
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
              <TableHead>Business</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  {tenant.businessName}
                </TableCell>
                <TableCell>{tenant.contactName ?? "-"}</TableCell>
                <TableCell>{tenant.email ?? "-"}</TableCell>
                <TableCell>{tenant.phone ?? "-"}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      tenant.status === "active" ? "secondary" : "outline"
                    }
                  >
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog(tenant)}
                    >
                      Edit
                    </Button>
                    {tenant.status === "active" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate({ id: tenant.id })}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TenantDialog open={open} onOpenChange={setOpen} tenant={editing} />
    </div>
  );
}
