export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_000) return `${sizeBytes} B`;
  if (sizeBytes < 1_000_000) return `${Math.round(sizeBytes / 1_000)} KB`;
  return `${Number((sizeBytes / 1_000_000).toFixed(1))} MB`;
}
