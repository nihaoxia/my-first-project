import "server-only";

import { randomBytes } from "@noble/hashes/utils.js";

import { getAuthoritativeBlobStore } from "../edgeone/blob-store";
import { getEdgeOneRuntimeConfig } from "../edgeone/runtime-config";
import { createEdgeOneAccountService } from "./edgeone-account-service-core";

export function getEdgeOneAccountService() {
  const config = getEdgeOneRuntimeConfig();
  return createEdgeOneAccountService({
    blob: getAuthoritativeBlobStore(config.blobStore),
    usernamePepper: config.sessionSecret,
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    randomBytes,
  });
}

