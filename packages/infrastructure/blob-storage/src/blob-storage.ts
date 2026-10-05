export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface SignedDownloadOptions {
  expiresInSeconds?: number;
  fileName?: string;
}

export interface BlobStorage {
  putObject(input: PutObjectInput): Promise<{ key: string }>;
  getSignedDownloadUrl(
    key: string,
    options?: SignedDownloadOptions,
  ): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
