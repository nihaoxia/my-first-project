import "server-only";

import { getStore } from "@edgeone/pages-blob";

import { createAuthoritativeBlobStore } from "./blob-store-core";
import type { BlobSdkStore } from "./blob-types";

export function getAuthoritativeBlobStore(name: string) {
  return createAuthoritativeBlobStore(getStore(name) as unknown as BlobSdkStore);
}
