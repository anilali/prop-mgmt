"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";

import { PageTopBar } from "./_components/page-top-bar";

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
    <>
      <PageTopBar crumbs={[{ label: "Something went wrong" }]} />
      <div className="nav:px-6 nav:py-[22px] px-4 py-[18px]">
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
        />
      </div>
    </>
  );
}
