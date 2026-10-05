export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface SignedDownloadOptions {
  expiresInSeconds?: number;
  fileName?: string;
}

export interface SignedUploadOptions {
  contentType: string;
  contentLength?: number;
  fileName?: string;
  expiresInSeconds?: number;
}

export interface SignedUpload {
  url: string;
  headers: Record<string, string>;
}

export interface ObjectInfo {
  sizeBytes: number;
  contentType: string | null;
  contentDisposition: string | null;
}

export interface BlobStorage {
  putObject(input: PutObjectInput): Promise<{ key: string }>;
  getSignedDownloadUrl(
    key: string,
    options?: SignedDownloadOptions,
  ): Promise<string>;
  getSignedUploadUrl(
    key: string,
    options: SignedUploadOptions,
  ): Promise<SignedUpload>;
  headObject(key: string): Promise<ObjectInfo | null>;
  isAvailable(): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
}
