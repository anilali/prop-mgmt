"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const queryErrors = useQueryErrorResetBoundary();

  return (
    <div className="flex flex-col gap-6 p-6">
      <EmptyState
        icon={<TriangleAlert className="size-5" />}
        headline="This page could not load"
        description={
          error.digest
            ? "Something went wrong on the server. Try again."
            : error.message
        }
        action={
          <Button
            type="button"
            onClick={() => {
              queryErrors.reset();
              startTransition(() => {
                router.refresh();
                reset();
              });
            }}
          >
            Try again
          </Button>
        }
        className="rounded-lg border border-dashed py-16"
      />
    </div>
  );
}
