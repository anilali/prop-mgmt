import { describe, expect, it } from "vitest";

import { attachmentDisposition, S3BlobStorage } from "./s3-blob-storage";

const storage = new S3BlobStorage({
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "bucket",
});

describe("attachmentDisposition", () => {
  it("keeps a plain file name readable", () => {
    expect(
      attachmentDisposition("2024 Reconciliation Super Lucky LLC A.pdf"),
    ).toBe(
      `attachment; filename="2024 Reconciliation Super Lucky LLC A.pdf"; filename*=UTF-8''2024%20Reconciliation%20Super%20Lucky%20LLC%20A.pdf`,
    );
  });

  it("replaces quotes and non-ASCII characters in the plain name", () => {
    expect(attachmentDisposition(`Café "B".pdf`)).toBe(
      `attachment; filename="Caf_ _B_.pdf"; filename*=UTF-8''Caf%C3%A9%20%22B%22.pdf`,
    );
  });
});

describe("S3BlobStorage.getSignedDownloadUrl", () => {
  it("signs for one hour by default with no file name", async () => {
    const url = new URL(await storage.getSignedDownloadUrl("a/b.pdf"));
    expect(url.pathname).toBe("/bucket/a/b.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.has("response-content-disposition")).toBe(false);
  });

  it("adds the file name and expiry when given", async () => {
    const url = new URL(
      await storage.getSignedDownloadUrl("a/b.pdf", {
        expiresInSeconds: 600,
        fileName: "2024 Reconciliation Tenant B Inc B.pdf",
      }),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("response-content-disposition")).toBe(
      attachmentDisposition("2024 Reconciliation Tenant B Inc B.pdf"),
    );
  });
});

describe("S3BlobStorage.getSignedUploadUrl", () => {
  it("signs a PUT that pins the content type and length", async () => {
    const upload = await storage.getSignedUploadUrl("documents/p/a/d.pdf", {
      contentType: "application/pdf",
      contentLength: 3_400_000,
      expiresInSeconds: 600,
    });
    const url = new URL(upload.url);
    expect(url.pathname).toBe("/bucket/documents/p/a/d.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host",
    );
    expect(upload.headers).toEqual({ "Content-Type": "application/pdf" });
  });

  it("signs and returns the attachment disposition when given a file name", async () => {
    const upload = await storage.getSignedUploadUrl("documents/p/a/d.pdf", {
      contentType: "application/pdf",
      contentLength: 3_400_000,
      fileName: "Café Lease.pdf",
    });
    const url = new URL(upload.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-disposition;content-length;content-type;host",
    );
    expect(upload.headers).toEqual({
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition("Café Lease.pdf"),
    });
  });
});
