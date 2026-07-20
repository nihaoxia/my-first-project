import "server-only";

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "@noble/hashes/utils.js";
import { getAppSession } from "../auth/app-session";
import { getAuthoritativeBlobStore } from "../edgeone/blob-store";
import { createEdgeOneQuotaService } from "../edgeone/quota-service-core";
import { getEdgeOneRuntimeConfig } from "../edgeone/runtime-config";
import { getCloudServerConfig } from "./server-config";
import { createCosStorageProviderFromConfig } from "./cos-storage-provider";
import { createEdgeOneStorageProvider } from "./edgeone-storage-provider";
import {
  createCloudStorageService,
  isSupabaseStorageNotFoundError,
  parseOriginalBookObjectPath,
} from "./storage-core";

export { CloudStorageError } from "./storage-core";

export function getOriginalBookStorage() {
  if (process.env.CLOUD_STORAGE_PROVIDER === "edgeone") {
    const config = getEdgeOneRuntimeConfig();
    const blob = getAuthoritativeBlobStore(config.blobStore);
    const quota = createEdgeOneQuotaService(blob);
    const providerFor = async (path: string, requireSession: boolean) => {
      const parsed = parseOriginalBookObjectPath(path);
      if (!parsed) throw Object.assign(new Error("INVALID_OBJECT_PATH"), { code: "INVALID_OBJECT_PATH" });
      if (requireSession) {
        const session = await getAppSession();
        if (!session || session.user.id !== parsed.userId) {
          throw Object.assign(new Error("INVALID_OBJECT_PATH"), { code: "INVALID_OBJECT_PATH" });
        }
      }
      return createEdgeOneStorageProvider({
        blob, quota, userId: parsed.userId,
        now: () => new Date(),
        uuid: () => crypto.randomUUID(),
        randomBytes,
        downloadSecret: config.sessionSecret,
      });
    };
    return createCloudStorageService({
      bucket: config.blobStore,
      provider: {
        async upload(path, bytes) { return (await providerFor(path, false)).upload(path, bytes); },
        async remove(path) { return (await providerFor(path, false)).remove(path); },
        async createSignedUrl(path, expiresInSeconds) {
          return (await providerFor(path, true)).createSignedUrl(path, expiresInSeconds);
        },
      },
    });
  }

  const result = getCloudServerConfig();
  if (!result.ok || !result.config.configured || !("serverConfigured" in result.config)) {
    const code = !result.ok ? result.error.code : "CLOUD_NOT_CONFIGURED";
    throw Object.assign(new Error(code), { code });
  }

  if (result.config.storageProvider === "cos") {
    return createCloudStorageService({
      bucket: result.config.cosBucket,
      provider: createCosStorageProviderFromConfig(result.config),
    });
  }

  const { supabaseUrl, supabaseServiceRoleKey, originalBooksBucket } = result.config;
  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch(input, init) {
        const timeout = AbortSignal.timeout(60_000);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return globalThis.fetch(input, { ...init, signal });
      },
    },
  });
  const bucket = client.storage.from(originalBooksBucket);

  return createCloudStorageService({
    bucket: originalBooksBucket,
    provider: {
      async upload(path, bytes) {
        const { error } = await bucket.upload(path, bytes, { contentType: "text/plain", upsert: false });
        if (error) throw error;
      },
      async remove(path) {
        const { error } = await bucket.remove([path]);
        if (error && !isSupabaseStorageNotFoundError(error)) throw error;
      },
      async createSignedUrl(path, expiresInSeconds) {
        const { data, error } = await bucket.createSignedUrl(path, expiresInSeconds, { download: true });
        if (error || !data?.signedUrl) throw error ?? new Error("signed URL unavailable");
        return data.signedUrl;
      },
    },
  });
}
