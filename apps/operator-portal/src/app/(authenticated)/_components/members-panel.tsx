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
import { PageHeader } from "@moonship/ui/page-header";

import { useTRPC } from "~/trpc/react";

type MemberRole = "admin" | "staff";

function errorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  if (!("data" in err)) return null;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("code" in data))
    return null;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function MembersPanel({ propertyId }: { propertyId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: members } = useSuspenseQuery(
    trpc.access.list.queryOptions({ propertyId }),
  );
  const [grantOpen, setGrantOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("staff");
  const [actionError, setActionError] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  const hasActiveAdmin = members.some(
    (member) => member.status === "active" && member.role === "admin",
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries(
      trpc.access.list.queryFilter({ propertyId }),
    );
  };

  const describeError = (err: unknown): { message: string; clash: boolean } => {
    const code = errorCode(err);
    if (code === "PRECONDITION_FAILED") {
      return {
        message: "A property needs at least one admin.",
        clash: false,
      };
    }
    if (code === "CONFLICT") {
      const serverMessage = err instanceof Error ? err.message : "";
      if (/already exists/i.test(serverMessage)) {
        return { message: serverMessage, clash: false };
      }
      return {
        message: "Someone else changed access. The list has been refreshed.",
        clash: true,
      };
    }
    return {
      message: err instanceof Error ? err.message : "Access update failed.",
      clash: false,
    };
  };

  const grant = useMutation(
    trpc.access.grant.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Access granted");
        setGrantError(null);
        setActionError(null);
        setGrantOpen(false);
        setEmail("");
        setRole("staff");
      },
      onError: async (err) => {
        const { message, clash } = describeError(err);
        if (clash) await invalidate();
        setGrantError(message);
      },
    }),
  );

  const changeRole = useMutation(
    trpc.access.changeRole.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setActionError(null);
        toast.success("Role changed");
      },
      onError: async (err) => {
        const { message, clash } = describeError(err);
        if (clash) await invalidate();
        setActionError(message);
      },
    }),
  );

  const revoke = useMutation(
    trpc.access.revoke.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setActionError(null);
        toast.success("Access revoked");
      },
      onError: async (err) => {
        const { message, clash } = describeError(err);
        if (clash) await invalidate();
        setActionError(message);
      },
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Members"
        description="Manage who can operate this property."
        action={
          <Button
            type="button"
            onClick={() => {
              setGrantError(null);
              setGrantOpen(true);
            }}
          >
            Grant access
          </Button>
        }
      />
      {actionError ? (
        <p className="text-destructive text-sm">{actionError}</p>
      ) : null}
      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          headline="No members"
          description="Grant access to the first member to get started."
          className="rounded-lg border border-dashed py-16"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Claimed</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.email}</TableCell>
                <TableCell>{member.role}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      member.status === "active" ? "secondary" : "outline"
                    }
                  >
                    {member.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.authUserId ? "Claimed" : "Not yet signed in"}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {member.status === "active" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          changeRole.mutate({
                            propertyId,
                            membershipId: member.id,
                            role:
                              member.role === "admin" ? "staff" : "admin",
                          })
                        }
                      >
                        Make {member.role === "admin" ? "staff" : "admin"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          revoke.mutate({
                            propertyId,
                            membershipId: member.id,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEmail(member.email);
                        setGrantError(null);
                        setGrantOpen(true);
                      }}
                    >
                      Grant again
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant access</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              grant.mutate({
                propertyId,
                email,
                role: hasActiveAdmin ? role : "admin",
              });
            }}
          >
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {hasActiveAdmin ? (
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) =>
                    setRole(value === "admin" ? "admin" : "staff")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Role</Label>
                <Input value="Admin" disabled />
                <p className="text-muted-foreground text-sm">
                  The first member must be an admin.
                </p>
              </div>
            )}
            {grantError ? (
              <p className="text-destructive text-sm">{grantError}</p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={grant.isPending}>
                Grant
              </Button>
            </DialogFooter>
          </form>
          <p className="text-muted-foreground text-sm">
            They get access the next time they sign in. If they are signed in
            now, they need to sign out and sign in again.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
