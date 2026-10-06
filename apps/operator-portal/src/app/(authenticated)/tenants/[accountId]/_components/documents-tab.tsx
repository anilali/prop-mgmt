"use client";

import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { formatFileSize } from "@moonship/shared";
import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { List } from "@moonship/ui/list";
import { NativeSelect } from "@moonship/ui/select";

import type { Lease } from "../../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import { formatDate, notifiedDateFormat } from "../../../_lib/format";

const PDF = "application/pdf";
const WHOLE_ACCOUNT = "account";
const MAX_BYTES = 25_000_000;

class StorageUploadError extends Error {}

function putFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new StorageUploadError(`Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new StorageUploadError("Upload failed"));
    request.send(file);
  });
}

function isStorageProblem(error: unknown): boolean {
  return (
    error instanceof StorageUploadError ||
    (error instanceof TRPCClientError &&
      (error.data as { code?: string } | undefined)?.code ===
        "SERVICE_UNAVAILABLE")
  );
}

function leaseLabel(lease: Lease): string {
  return `${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}`;
}

export function DocumentsTab({
  accountId,
  leases,
  timeZone,
}: {
  accountId: string;
  leases: readonly Lease[];
  timeZone: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    trpc.document.list.queryOptions({ accountId }),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [leaseChoice, setLeaseChoice] = useState(WHOLE_ACCOUNT);
  const [progress, setProgress] = useState<number | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const uploadedFormat = notifiedDateFormat(timeZone);

  const refreshList = () =>
    queryClient.invalidateQueries(
      trpc.document.list.queryFilter({ accountId }),
    );

  const createUpload = useMutation(
    trpc.document.createUpload.mutationOptions(),
  );
  const confirmUpload = useMutation(
    trpc.document.confirmUpload.mutationOptions(),
  );
  const download = useMutation(
    trpc.document.downloadUrl.mutationOptions({
      onSuccess: (result) => window.location.assign(result.url),
      onError: (err) => {
        if (isStorageProblem(err)) setStorageFailed(true);
        toast.error(err.message);
      },
    }),
  );
  const remove = useMutation(
    trpc.document.remove.mutationOptions({
      onSuccess: async () => {
        setConfirming(null);
        await refreshList();
        toast.success("Document removed");
      },
      onError: (err) => {
        if (isStorageProblem(err)) setStorageFailed(true);
        toast.error(err.message);
      },
    }),
  );

  const storageMissing = !data.storageReady || storageFailed;
  const uploading = progress !== null;
  const blocked = uploading || storageMissing;

  async function uploadFile(file: File) {
    const contentType =
      file.type || (file.name.toLowerCase().endsWith(".pdf") ? PDF : "");
    if (contentType !== PDF) {
      toast.error("Choose a PDF file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 25 MB");
      return;
    }
    const input = {
      accountId,
      leaseId: leaseChoice === WHOLE_ACCOUNT ? null : leaseChoice,
      fileName: file.name,
      sizeBytes: file.size,
      contentType,
    };
    setProgress(0);
    try {
      const upload = await createUpload.mutateAsync(input);
      await putFile(upload.uploadUrl, upload.headers, file, setProgress);
      await confirmUpload.mutateAsync({
        ...input,
        documentId: upload.documentId,
      });
      await refreshList();
      toast.success(`Uploaded ${file.name}`);
    } catch (error) {
      if (isStorageProblem(error)) {
        setStorageFailed(true);
        toast.error("File storage isn't set up yet");
      } else {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-3">
      <List>
        {data.documents.length === 0 ? (
          <p className="text-fg-2 px-3.5 py-3 text-[12.5px]">
            No documents yet.
          </p>
        ) : null}
        {data.documents.map((document) => {
          const lease = leases.find((l) => l.id === document.leaseId);
          return (
            <div
              key={document.id}
              className="group border-line grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2.5 [&+&]:border-t"
            >
              <span className="bg-sunk border-line-2 text-fg-2 grid size-7 place-items-center rounded-[7px] border">
                <FileText className="size-[15px]" strokeWidth={1.7} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium [overflow-wrap:anywhere]">
                  {document.fileName}
                </span>
                <span className="text-fg-3 block text-[11.5px]">
                  {formatFileSize(document.sizeBytes)} · uploaded{" "}
                  {uploadedFormat.format(document.uploadedAt)}
                  {lease ? ` · lease ${leaseLabel(lease)}` : ""}
                </span>
              </span>
              {confirming === document.id ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-fg-3 text-[11.5px]">Remove?</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ documentId: document.id })}
                  >
                    Remove
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${document.fileName}`}
                    title="Download"
                    disabled={download.isPending}
                    onClick={() => download.mutate({ documentId: document.id })}
                  >
                    <Download />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${document.fileName}`}
                    title="Remove"
                    className="hover:text-red opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    onClick={() => setConfirming(document.id)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </div>
          );
        })}
      </List>

      {storageMissing ? (
        <p className="bg-sunk border-line text-fg-2 rounded-lg border px-3 py-2.5 text-[12.5px]">
          File storage isn&apos;t set up yet. Uploads and downloads will work
          once it is.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {leases.length > 0 ? (
          <NativeSelect
            aria-label="Lease for the next upload"
            className="w-auto max-w-full"
            value={leaseChoice}
            disabled={blocked}
            onChange={(e) => setLeaseChoice(e.target.value)}
          >
            <option value={WHOLE_ACCOUNT}>Not tied to a lease</option>
            {leases.map((lease) => (
              <option key={lease.id} value={lease.id}>
                Lease {leaseLabel(lease)}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <button
        type="button"
        disabled={blocked}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (blocked) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file && !blocked) void uploadFile(file);
        }}
        className={cn(
          "border-line-2 text-fg-2 flex cursor-pointer items-center justify-center gap-2 rounded-[9px] border border-dashed p-3.5 text-[13px] transition-colors",
          "hover:border-accent-line hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          over && "border-accent-line bg-accent-soft",
        )}
      >
        <Upload className="size-[15px]" strokeWidth={1.7} />
        {uploading ? (
          `Uploading ${progress}%`
        ) : (
          <span>
            Drop a signed lease PDF or{" "}
            <span className="text-primary font-medium">choose a file</span>
            <span className="text-fg-3"> · up to 25 MB</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void uploadFile(file);
        }}
      />
    </div>
  );
}
