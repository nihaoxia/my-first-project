export type BlobListItem = { key: string; etag: string };

export type BlobSdkStore = {
  set(
    key: string,
    value: string | Uint8Array,
    options?: { onlyIfNew?: boolean },
  ): Promise<void>;
  setJSON(
    key: string,
    value: unknown,
    options?: { onlyIfNew?: boolean },
  ): Promise<void>;
  get(
    key: string,
    options: {
      type: "json" | "text" | "arrayBuffer";
      consistency: "strong";
    },
  ): Promise<unknown | null>;
  getWithHeaders(
    key: string,
    options: { consistency: "strong" },
  ): Promise<{ body: unknown; headers: Record<string, string> } | null>;
  delete(key: string): Promise<void>;
  list(options: {
    prefix?: string;
    cursor?: string;
    paginate: false;
    consistency: "strong";
  }): Promise<{ blobs: BlobListItem[]; cursor?: string }>;
};
