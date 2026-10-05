"use client";

import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import { formatFileSize } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
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

import type { Lease } from "../../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import { formatDate, notifiedDateFormat } from "../../_lib/format";
import { ConfirmDialog } from "../../../setup/_components/confirm-dialog";

type LeaseDocument = RouterOutputs["document"]["list"]["documents"][number];

const PDF = "application/pdf";
const WHOLE_ACCOUNT = "account";
const STORAGE_MESSAGE =
  "File storage isn't set up yet. Uploads and downloads will work once it is.";

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

export function DocumentsSection({
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
  const [toRemove, setToRemove] = useState<LeaseDocument | null>(null);
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

  async function uploadFile(file: File) {
    const contentType =
      file.type || (file.name.toLowerCase().endsWith(".pdf") ? PDF : "");
    if (contentType !== PDF) {
      toast.error("Choose a PDF file");
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
      toast.success("Document uploaded");
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
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold">Documents</h2>
          <p className="text-muted-foreground text-sm">
            Signed leases and other PDFs for this account, up to 25 MB each.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {leases.length > 0 ? (
            <Select
              value={leaseChoice}
              onValueChange={setLeaseChoice}
              disabled={uploading || storageMissing}
            >
              <SelectTrigger
                className="sm:w-64"
                aria-label="Lease for the next upload"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_ACCOUNT}>
                  Not tied to a lease
                </SelectItem>
                {leases.map((lease) => (
                  <SelectItem key={lease.id} value={lease.id}>
                    Lease {leaseLabel(lease)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
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
          <Button
            type="button"
            disabled={uploading || storageMissing}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            {uploading ? `Uploading ${progress}%` : "Upload PDF"}
          </Button>
        </div>
      </div>

      {storageMissing ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
          {STORAGE_MESSAGE}
        </p>
      ) : null}

      {data.documents.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm">
          No documents yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Lease</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.documents.map((document) => {
              const lease = leases.find((l) => l.id === document.leaseId);
              return (
                <TableRow key={document.id}>
                  <TableCell className="max-w-72 truncate font-medium">
                    <span title={document.fileName}>{document.fileName}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {lease ? leaseLabel(lease) : "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {uploadedFormat.format(document.uploadedAt)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatFileSize(document.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={download.isPending}
                      onClick={() =>
                        download.mutate({ documentId: document.id })
                      }
                    >
                      <Download className="size-4" />
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => setToRemove(document)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        title="Remove this document?"
        description={
          toRemove
            ? `${toRemove.fileName} will be deleted. This can't be undone.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (toRemove) remove.mutate({ documentId: toRemove.id });
        }}
      />
    </section>
  );
}
