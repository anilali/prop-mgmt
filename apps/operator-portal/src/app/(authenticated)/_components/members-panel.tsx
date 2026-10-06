"use client";

import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { List, ListRow } from "@moonship/ui/list";
import { NativeSelect } from "@moonship/ui/select";
import { StatusPill } from "@moonship/ui/status-pill";

import { useTRPC } from "~/trpc/react";

type MemberRole = "admin" | "staff";
type Member = RouterOutputs["access"]["list"][number];

const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  staff: "Staff",
};

const HOVER_ACTION =
  "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100";

function errorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  if (!("data" in err)) return null;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("code" in data))
    return null;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function memberState(member: Member): {
  label: string;
  variant: "paid" | "due" | "plain";
} {
  if (member.status !== "active") return { label: "Removed", variant: "plain" };
  if (!member.authUserId) return { label: "Invited", variant: "due" };
  return { label: "Active", variant: "paid" };
}

function byStatusThenEmail(a: Member, b: Member): number {
  const status = Number(a.status !== "active") - Number(b.status !== "active");
  return status !== 0 ? status : a.email.localeCompare(b.email);
}

export function MembersPanel({ propertyId }: { propertyId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: members } = useSuspenseQuery(
    trpc.access.list.queryOptions({ propertyId }),
  );
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("staff");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  const hasActiveAdmin = members.some(
    (member) => member.status === "active" && member.role === "admin",
  );
  const sorted = [...members].sort(byStatusThenEmail);

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
        return { message: "This person already has access.", clash: false };
      }
      return {
        message: "Someone else changed access. The list is up to date now.",
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
        toast.success("Invited. They get access the next time they sign in.");
        setGrantError(null);
        setActionError(null);
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
        setRemovingId(null);
        setActionError(null);
        toast.success("Access removed");
      },
      onError: async (err) => {
        const { message, clash } = describeError(err);
        if (clash) await invalidate();
        setRemovingId(null);
        setActionError(message);
      },
    }),
  );

  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      {actionError ? (
        <p className="text-red text-[12.5px]">{actionError}</p>
      ) : null}
      <List className="animate-rise">
        {sorted.length === 0 ? (
          <div className="text-fg-3 px-3.5 py-3 text-[12.5px]">
            No one has access yet.
          </div>
        ) : null}
        {sorted.map((member) => {
          const state = memberState(member);
          const active = member.status === "active";
          const otherRole: MemberRole =
            member.role === "admin" ? "staff" : "admin";
          return (
            <ListRow
              key={member.id}
              columns="22px minmax(0,1fr) auto"
              className="group"
            >
              <span
                aria-hidden
                className={cn(
                  "bg-accent-soft text-primary border-accent-line grid size-[22px] place-items-center rounded-full border text-[11px] font-semibold",
                  !active && "opacity-50",
                )}
              >
                {member.email.charAt(0).toUpperCase()}
              </span>
              <span
                className={cn("truncate font-medium", !active && "text-fg-3")}
              >
                {member.email}
              </span>
              {removingId === member.id ? (
                <span className="flex items-center justify-end gap-1.5">
                  <span className="text-fg-3 text-[11.5px]">
                    Remove access?
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRemovingId(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate({ propertyId, membershipId: member.id })
                    }
                  >
                    Remove
                  </Button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center justify-end gap-1.5">
                  {active ? (
                    <span className={cn("flex gap-0.5", HOVER_ACTION)}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={changeRole.isPending}
                        onClick={() =>
                          changeRole.mutate({
                            propertyId,
                            membershipId: member.id,
                            role: otherRole,
                          })
                        }
                      >
                        Make {otherRole}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove access for ${member.email}`}
                        title="Remove access"
                        className="hover:text-red"
                        onClick={() => setRemovingId(member.id)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={HOVER_ACTION}
                      onClick={() => {
                        setEmail(member.email);
                        setGrantError(null);
                        emailRef.current?.focus();
                      }}
                    >
                      Invite again
                    </Button>
                  )}
                  <StatusPill variant="plain">
                    {ROLE_LABELS[member.role]}
                  </StatusPill>
                  <StatusPill variant={state.variant}>{state.label}</StatusPill>
                </span>
              )}
            </ListRow>
          );
        })}
      </List>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          grant.mutate({
            propertyId,
            email: email.trim(),
            role: hasActiveAdmin ? role : "admin",
          });
        }}
      >
        <Input
          ref={emailRef}
          type="email"
          placeholder="name@example.com"
          aria-label="Email to invite"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-[200px] flex-1"
          required
        />
        <NativeSelect
          aria-label="Role"
          value={hasActiveAdmin ? role : "admin"}
          disabled={!hasActiveAdmin}
          onChange={(e) =>
            setRole(e.target.value === "admin" ? "admin" : "staff")
          }
          className="w-[120px]"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </NativeSelect>
        <Button type="submit" variant="primary" disabled={grant.isPending}>
          Invite
        </Button>
      </form>
      {grantError ? (
        <p className="text-red text-[12.5px]">{grantError}</p>
      ) : null}
      <p className="text-fg-3 text-[11.5px]">
        {hasActiveAdmin
          ? "Only admins can add and remove people."
          : "The first person must be an admin."}
      </p>
    </div>
  );
}
