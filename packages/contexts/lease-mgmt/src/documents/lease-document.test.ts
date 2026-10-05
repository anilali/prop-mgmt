import { describe, expect, it } from "vitest";

import {
  LEASE_DOCUMENT_MAX_BYTES,
  leaseDocumentFileProblem,
  leaseDocumentStorageKey,
} from "./lease-document";

describe("leaseDocumentFileProblem", () => {
  it("accepts a PDF up to the limit", () => {
    expect(
      leaseDocumentFileProblem({
        contentType: "application/pdf",
        sizeBytes: LEASE_DOCUMENT_MAX_BYTES,
      }),
    ).toBeNull();
  });

  it("rejects other types, empty files, and files over the limit", () => {
    expect(
      leaseDocumentFileProblem({ contentType: "image/png", sizeBytes: 10 }),
    ).toBe("Only PDF files can be uploaded");
    expect(leaseDocumentFileProblem({ contentType: null, sizeBytes: 10 })).toBe(
      "Only PDF files can be uploaded",
    );
    expect(
      leaseDocumentFileProblem({
        contentType: "application/pdf",
        sizeBytes: 0,
      }),
    ).toBe("The file is empty");
    expect(
      leaseDocumentFileProblem({
        contentType: "application/pdf",
        sizeBytes: 31_200_000,
      }),
    ).toBe("The file is 31.2 MB. The limit is 25 MB.");
  });
});

describe("leaseDocumentStorageKey", () => {
  it("puts the property and account in the key", () => {
    expect(leaseDocumentStorageKey("p", "a", "d")).toBe("documents/p/a/d.pdf");
  });
});
