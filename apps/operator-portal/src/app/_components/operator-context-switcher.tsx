"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  OperableProperty,
  OperatorContext,
} from "@moonship/api-operator/server";

import { setOperatorContextAction } from "~/app/_actions/operator-context";

const PLATFORM_VALUE = "platform";

export function OperatorContextSwitcher({
  context,
  operableProperties,
  isPlatformAdmin,
}: {
  context: OperatorContext;
  operableProperties: OperableProperty[];
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (context.mode === "no-access") {
    return null;
  }

  const properties = [...operableProperties].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  if (properties.length === 0) {
    if (!isPlatformAdmin) {
      return null;
    }
    return (
      <div className="bg-background truncate rounded-md border px-2 py-1.5 text-sm">
        Platform
      </div>
    );
  }

  if (properties.length === 1 && !isPlatformAdmin) {
    const only = properties[0];
    if (!only) {
      return null;
    }
    return (
      <div className="bg-background truncate rounded-md border px-2 py-1.5 text-sm">
        {only.name}
      </div>
    );
  }

  const currentValue =
    context.mode === "platform" ? PLATFORM_VALUE : context.propertyId;

  return (
    <select
      aria-label="Context"
      className="bg-background rounded-md border px-2 py-1.5 text-sm"
      value={currentValue}
      disabled={isPending}
      onChange={(event) => {
        const value = event.target.value;
        startTransition(async () => {
          const result = await setOperatorContextAction(value);
          if (result.ok && result.path) {
            router.push(result.path);
            router.refresh();
          }
        });
      }}
    >
      {properties.map((property) => (
        <option key={property.id} value={property.id}>
          {property.name}
        </option>
      ))}
      {isPlatformAdmin ? (
        <option value={PLATFORM_VALUE}>Platform</option>
      ) : null}
    </select>
  );
}
