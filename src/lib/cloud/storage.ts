import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getCloudServerConfig } from "./server-config";
import { createCosStorageProviderFromConfig } from "./cos-storage-provider";
import { getCloudServices } from "./service-factory";
import {
  createCloudStorageService,
  isSupabaseStorageNotFoundError,
} from "./storage-core";

export { CloudStorageError } from "./storage-core";

export function getOriginalBookStorage() {
  if (process.env.CLOUD_STORAGE_PROVIDER === "edgeone") {
    return getCloudServices().storage;
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
