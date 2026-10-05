import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { attachmentDisposition } from "@moonship/blob-storage";

import type { TestCaller } from "../test-setup-stores";
import { STORAGE_UNAVAILABLE_MESSAGE } from "../errors";
import {
  codeOf,
  createTestApp,
  leaseInput,
  PLATFORM_ADMIN,
  PROPERTY_ID,
  STRANGER,
  TEST_ADDRESS,
} from "../test-setup-stores";

const ID = "77777777-7777-4777-8777-777777777777";
const PDF = "application/pdf";
const DISPOSITION = attachmentDisposition("Lease 2024.pdf");

async function setup() {
  const app = createTestApp();
  const caller = await app.callerFor();
  const unit = await caller.unit.create({
    label: "A",
    sqft: 2500,
    address: TEST_ADDRESS,
  });
  const tenant = await caller.tenant.create({
    businessName: "Super Lucky LLC",
  });
  if (!tenant) throw new Error("missing tenant");
  const detail = await caller.account.open({
    tenantId: tenant.id,
    unitId: unit.id,
    openingBalanceCents: 0,
    lease: leaseInput(),
  });
  const accountId = detail.account.id;
  const leaseId = detail.account.leases[0]?.id;
  if (!leaseId) throw new Error("missing lease");
  return { app, caller, accountId, leaseId };
}

type App = Awaited<ReturnType<typeof setup>>["app"];

function file(overrides: { sizeBytes?: number; contentType?: string } = {}) {
  return {
    fileName: "Lease 2024.pdf",
    sizeBytes: overrides.sizeBytes ?? 3_400_000,
    contentType: overrides.contentType ?? PDF,
  };
}

function putFromBrowser(
  app: App,
  key: string,
  sizeBytes: number,
  headers: { contentType?: string; contentDisposition?: string | null } = {},
) {
  app.blob.objects.set(key, {
    body: new Uint8Array(sizeBytes),
    contentType: headers.contentType ?? PDF,
    contentDisposition:
      headers.contentDisposition === null
        ? undefined
        : (headers.contentDisposition ?? DISPOSITION),
  });
}

async function upload(
  app: App,
  caller: TestCaller,
  accountId: string,
  leaseId: string | null = null,
) {
  const input = { accountId, leaseId, ...file() };
  const { documentId } = await caller.document.createUpload(input);
  putFromBrowser(
    app,
    `documents/${PROPERTY_ID}/${accountId}/${documentId}.pdf`,
    input.sizeBytes,
  );
  return caller.document.confirmUpload({ ...input, documentId });
}

async function errorOf(promise: Promise<unknown>): Promise<TRPCError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error;
    throw error;
  }
  throw new Error("expected procedure to throw");
}

const calls: [string, (caller: TestCaller) => Promise<unknown>][] = [
  ["document.list", (c) => c.document.list({ accountId: ID })],
  [
    "document.createUpload",
    (c) => c.document.createUpload({ accountId: ID, ...file() }),
  ],
  [
    "document.confirmUpload",
    (c) =>
      c.document.confirmUpload({ accountId: ID, documentId: ID, ...file() }),
  ],
  ["document.downloadUrl", (c) => c.document.downloadUrl({ documentId: ID })],
  ["document.remove", (c) => c.document.remove({ documentId: ID })],
];

describe("document procedures need property mode and membership", () => {
  it.each(calls)("%s rejects platform mode", async (_name, call) => {
    const caller = await createTestApp().callerFor(PLATFORM_ADMIN, "platform");
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });

  it.each(calls)("%s rejects a non-member", async (_name, call) => {
    const caller = await createTestApp().callerFor(STRANGER);
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });
});

describe("document.createUpload", () => {
  it("signs a direct upload for a PDF without saving a row", async () => {
    const { app, caller, accountId, leaseId } = await setup();

    const result = await caller.document.createUpload({
      accountId,
      leaseId,
      ...file({ sizeBytes: 7_800_000 }),
    });

    const key = `documents/${PROPERTY_ID}/${accountId}/${result.documentId}.pdf`;
    expect(result).toEqual({
      documentId: result.documentId,
      uploadUrl: `https://blob/${key}?upload`,
      headers: { "Content-Type": PDF, "Content-Disposition": DISPOSITION },
      expiresInSeconds: 900,
    });
    expect(app.blob.uploads).toEqual([
      {
        key,
        options: {
          contentType: PDF,
          contentLength: 7_800_000,
          fileName: "Lease 2024.pdf",
          expiresInSeconds: 900,
        },
      },
    ]);
    expect(app.documents.documents.size).toBe(0);
  });

  it("rejects a file that is not a PDF, empty, or over 25 MB", async () => {
    const { app, caller, accountId } = await setup();

    const notPdf = await errorOf(
      caller.document.createUpload({
        accountId,
        ...file({ contentType: "image/png" }),
      }),
    );
    expect(notPdf.code).toBe("BAD_REQUEST");
    expect(notPdf.message).toBe("Only PDF files can be uploaded");

    const tooBig = await errorOf(
      caller.document.createUpload({
        accountId,
        ...file({ sizeBytes: 25_000_001 }),
      }),
    );
    expect(tooBig.code).toBe("BAD_REQUEST");
    expect(tooBig.message).toBe("The file is 25 MB. The limit is 25 MB.");

    expect(
      await codeOf(
        caller.document.createUpload({ accountId, ...file({ sizeBytes: 0 }) }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.blob.uploads).toEqual([]);
  });

  it("rejects an unknown account and a lease from another account", async () => {
    const { caller, accountId } = await setup();

    expect(
      await codeOf(
        caller.document.createUpload({ accountId: randomUUID(), ...file() }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        caller.document.createUpload({
          accountId,
          leaseId: randomUUID(),
          ...file(),
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("returns a readable error when storage is not set up", async () => {
    const { app, caller, accountId } = await setup();
    app.blob.available = false;

    const error = await errorOf(
      caller.document.createUpload({ accountId, ...file() }),
    );

    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.message).toBe(STORAGE_UNAVAILABLE_MESSAGE);
    expect(app.blob.uploads).toEqual([]);
  });
});

describe("document.confirmUpload", () => {
  it("saves the document once the object is in storage", async () => {
    const { app, caller, accountId, leaseId } = await setup();

    const saved = await upload(app, caller, accountId, leaseId);

    expect(saved).toMatchObject({
      accountId,
      leaseId,
      fileName: "Lease 2024.pdf",
      sizeBytes: 3_400_000,
    });
    expect(app.documents.documents.get(saved.id)?.storageKey).toBe(
      `documents/${PROPERTY_ID}/${accountId}/${saved.id}.pdf`,
    );
    const listed = await caller.document.list({ accountId });
    expect(listed.storageReady).toBe(true);
    expect(listed.documents).toEqual([saved]);
  });

  it("rejects a missing upload", async () => {
    const { app, caller, accountId } = await setup();
    const input = { accountId, ...file() };
    const { documentId } = await caller.document.createUpload(input);

    const error = await errorOf(
      caller.document.confirmUpload({ ...input, documentId }),
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("The upload did not finish. Try again.");
    expect(app.documents.documents.size).toBe(0);
  });

  it("rejects and deletes an object with the wrong size or type", async () => {
    const { app, caller, accountId } = await setup();
    const input = { accountId, ...file() };

    const wrongSize = await caller.document.createUpload(input);
    const sizeKey = `documents/${PROPERTY_ID}/${accountId}/${wrongSize.documentId}.pdf`;
    putFromBrowser(app, sizeKey, input.sizeBytes + 1);
    expect(
      await codeOf(
        caller.document.confirmUpload({
          ...input,
          documentId: wrongSize.documentId,
        }),
      ),
    ).toBe("BAD_REQUEST");

    const wrongType = await caller.document.createUpload(input);
    const typeKey = `documents/${PROPERTY_ID}/${accountId}/${wrongType.documentId}.pdf`;
    putFromBrowser(app, typeKey, input.sizeBytes, {
      contentType: "text/html",
    });
    const error = await errorOf(
      caller.document.confirmUpload({
        ...input,
        documentId: wrongType.documentId,
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("Only PDF files can be uploaded");

    const tooBig = await caller.document.createUpload(input);
    const bigKey = `documents/${PROPERTY_ID}/${accountId}/${tooBig.documentId}.pdf`;
    putFromBrowser(app, bigKey, 25_000_001);
    expect(
      await codeOf(
        caller.document.confirmUpload({
          ...input,
          documentId: tooBig.documentId,
        }),
      ),
    ).toBe("BAD_REQUEST");

    expect(app.blob.deleted).toEqual([sizeKey, typeKey, bigKey]);
    expect(app.blob.objects.size).toBe(0);
    expect(app.documents.documents.size).toBe(0);
  });

  it("rejects and deletes an object stored without the file name", async () => {
    const { app, caller, accountId } = await setup();
    const input = { accountId, ...file() };

    const missing = await caller.document.createUpload(input);
    const missingKey = `documents/${PROPERTY_ID}/${accountId}/${missing.documentId}.pdf`;
    putFromBrowser(app, missingKey, input.sizeBytes, {
      contentDisposition: null,
    });
    const error = await errorOf(
      caller.document.confirmUpload({
        ...input,
        documentId: missing.documentId,
      }),
    );
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe(
      "The upload did not keep the file name. Try again.",
    );

    const other = await caller.document.createUpload(input);
    const otherKey = `documents/${PROPERTY_ID}/${accountId}/${other.documentId}.pdf`;
    putFromBrowser(app, otherKey, input.sizeBytes, {
      contentDisposition: attachmentDisposition("Other.pdf"),
    });
    expect(
      await codeOf(
        caller.document.confirmUpload({
          ...input,
          documentId: other.documentId,
        }),
      ),
    ).toBe("BAD_REQUEST");

    expect(app.blob.deleted).toEqual([missingKey, otherKey]);
    expect(app.documents.documents.size).toBe(0);
  });

  it("rejects a second confirm of the same document", async () => {
    const { app, caller, accountId } = await setup();
    const saved = await upload(app, caller, accountId);

    expect(
      await codeOf(
        caller.document.confirmUpload({
          accountId,
          documentId: saved.id,
          ...file(),
        }),
      ),
    ).toBe("CONFLICT");
    expect(app.documents.documents.size).toBe(1);
  });

  it("only finds the object under the account it was signed for", async () => {
    const { app, caller, accountId } = await setup();
    const input = { accountId, ...file() };
    const { documentId } = await caller.document.createUpload(input);
    putFromBrowser(
      app,
      `documents/${PROPERTY_ID}/${accountId}/${documentId}.pdf`,
      input.sizeBytes,
    );
    const tenant = await caller.tenant.create({ businessName: "Tenant B" });
    if (!tenant) throw new Error("missing tenant");
    const unit = await caller.unit.create({
      label: "B",
      sqft: 2000,
      address: TEST_ADDRESS,
    });
    const other = await caller.account.open({
      tenantId: tenant.id,
      unitId: unit.id,
      openingBalanceCents: 0,
      lease: leaseInput(),
    });

    expect(
      await codeOf(
        caller.document.confirmUpload({
          ...input,
          accountId: other.account.id,
          documentId,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(app.documents.documents.size).toBe(0);
  });
});

describe("document.downloadUrl and document.remove", () => {
  it("signs the stored file for one hour with its file name", async () => {
    const { app, caller, accountId } = await setup();
    const saved = await upload(app, caller, accountId);

    const result = await caller.document.downloadUrl({ documentId: saved.id });

    const key = `documents/${PROPERTY_ID}/${accountId}/${saved.id}.pdf`;
    expect(result).toEqual({
      url: `https://blob/${key}`,
      fileName: "Lease 2024.pdf",
      expiresInSeconds: 3600,
    });
    expect(app.blob.signed).toEqual([
      { key, options: { expiresInSeconds: 3600, fileName: "Lease 2024.pdf" } },
    ]);
  });

  it("removes the object and the row", async () => {
    const { app, caller, accountId } = await setup();
    const saved = await upload(app, caller, accountId);
    const kept = await upload(app, caller, accountId);

    expect(await caller.document.remove({ documentId: saved.id })).toEqual({
      ok: true,
    });

    const key = `documents/${PROPERTY_ID}/${accountId}/${saved.id}.pdf`;
    expect(app.blob.deleted).toEqual([key]);
    expect(app.blob.objects.has(key)).toBe(false);
    expect(
      (await caller.document.list({ accountId })).documents.map((d) => d.id),
    ).toEqual([kept.id]);
    expect(await codeOf(caller.document.remove({ documentId: saved.id }))).toBe(
      "NOT_FOUND",
    );
  });

  it("keeps the row when storage cannot delete the object", async () => {
    const { app, caller, accountId } = await setup();
    const saved = await upload(app, caller, accountId);
    app.blob.available = false;

    expect(await codeOf(caller.document.remove({ documentId: saved.id }))).toBe(
      "SERVICE_UNAVAILABLE",
    );
    expect(app.documents.documents.has(saved.id)).toBe(true);
    const listed = await caller.document.list({ accountId });
    expect(listed.storageReady).toBe(false);
    expect(listed.documents.map((d) => d.id)).toEqual([saved.id]);
  });
});

describe("documents from another property", () => {
  it("cannot be listed, downloaded, removed, or uploaded to", async () => {
    const { app, caller } = await setup();
    const otherProperty = randomUUID();
    const otherAccount = randomUUID();
    const documentId = randomUUID();
    const storageKey = `documents/${otherProperty}/${otherAccount}/${documentId}.pdf`;
    app.accounts.accounts.set(otherAccount, {
      id: otherAccount,
      propertyId: otherProperty,
      tenantId: randomUUID(),
      unitId: randomUUID(),
      openingBalanceCents: 0,
      version: 1,
      leases: [],
    });
    app.documents.documents.set(documentId, {
      id: documentId,
      propertyId: otherProperty,
      accountId: otherAccount,
      leaseId: null,
      fileName: "Other.pdf",
      contentType: PDF,
      sizeBytes: 100,
      storageKey,
      uploadedAt: new Date(),
    });
    putFromBrowser(app, storageKey, 100);

    expect(
      await codeOf(caller.document.list({ accountId: otherAccount })),
    ).toBe("NOT_FOUND");
    expect(await codeOf(caller.document.downloadUrl({ documentId }))).toBe(
      "NOT_FOUND",
    );
    expect(await codeOf(caller.document.remove({ documentId }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await codeOf(
        caller.document.createUpload({ accountId: otherAccount, ...file() }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        caller.document.confirmUpload({
          accountId: otherAccount,
          documentId,
          ...file({ sizeBytes: 100 }),
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(app.blob.signed).toEqual([]);
    expect(app.blob.uploads).toEqual([]);
    expect(app.blob.deleted).toEqual([]);
    expect(app.documents.documents.has(documentId)).toBe(true);
  });
});

describe("account.remove with documents", () => {
  it("is blocked until the documents are removed", async () => {
    const { app, caller, accountId } = await setup();
    const saved = await upload(app, caller, accountId);

    const error = await errorOf(caller.account.remove({ id: accountId }));
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe(
      "This account has documents. Remove them before deleting the account.",
    );
    expect(app.accounts.accounts.has(accountId)).toBe(true);

    await caller.document.remove({ documentId: saved.id });
    expect(await caller.account.remove({ id: accountId })).toEqual({
      ok: true,
    });
  });
});
