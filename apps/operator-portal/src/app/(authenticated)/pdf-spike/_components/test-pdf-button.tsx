"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";

import { useTRPC } from "~/trpc/react";

function downloadPdf(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TestPdfButton() {
  const trpc = useTRPC();
  const render = useMutation(
    trpc.pdfSpike.render.mutationOptions({
      onSuccess: ({ base64, fileName }) => downloadPdf(base64, fileName),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <Button onClick={() => render.mutate()} disabled={render.isPending}>
      {render.isPending ? "Rendering…" : "Test PDF"}
    </Button>
  );
}
