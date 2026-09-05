"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";

import { useTRPC } from "~/trpc/react";

export function PendingStaffAccess({
  canClaimAdmin,
}: {
  canClaimAdmin: boolean;
}) {
  const trpc = useTRPC();

  const claimAdmin = useMutation(
    trpc.property.claimAdmin.mutationOptions({
      onSuccess: () => {
        toast.success("Admin access granted");
        window.location.reload();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (canClaimAdmin) {
    return (
      <div className="max-w-xl space-y-3">
        <p className="text-muted-foreground text-sm">
          This deployment already has a property configured, but no operator
          staff yet. Claim admin access to manage units, tenants, and leases.
        </p>
        <Button
          type="button"
          onClick={() => claimAdmin.mutate()}
          disabled={claimAdmin.isPending}
        >
          {claimAdmin.isPending ? "Claiming…" : "Claim admin access"}
        </Button>
      </div>
    );
  }

  return (
    <p className="text-muted-foreground max-w-xl text-sm">
      This property is managed by another operator. Contact your property
      administrator if you need access.
    </p>
  );
}
