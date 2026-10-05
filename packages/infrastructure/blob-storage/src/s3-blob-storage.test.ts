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
