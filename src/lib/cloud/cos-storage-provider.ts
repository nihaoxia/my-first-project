import COS from "cos-nodejs-sdk-v5";

import type { CloudStorageProvider } from "./storage-core.ts";
import type { CosStorageServerConfig } from "./server-config-core.ts";

type CosObjectParams = {
  Bucket: string;
  Region: string;
  Key: string;
};

type CosPutObjectParams = CosObjectParams & {
  Body: Uint8Array;
  ContentType: string;
  ContentDisposition: string;
};

type CosGetObjectUrlParams = CosObjectParams & {
  Sign: true;
  Method: "GET";
  Expires: number;
  Protocol: "https:";
  Query: Record<string, string>;
};

export interface CosStorageClient {
  putObject(params: CosPutObjectParams): Promise<unknown>;
  deleteObject(params: CosObjectParams): Promise<unknown>;
  getObjectUrl(params: CosGetObjectUrlParams): string;
}

export function isCosObjectNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = Number(record.statusCode ?? record.status);
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  return status === 404 && /^(nosuchkey|notfound|no_such_key)$/.test(code);
}

export function createCosStorageProvider(input: {
  bucket: string;
  region: string;
  client: CosStorageClient;
}): CloudStorageProvider {
  const expectedHost = `${input.bucket}.cos.${input.region}.myqcloud.com`;

  return {
    async upload(path, bytes) {
      await input.client.putObject({
        Bucket: input.bucket,
        Region: input.region,
        Key: path,
        Body: bytes,
        ContentType: "text/plain; charset=utf-8",
        ContentDisposition: "attachment; filename=original.txt",
      });
    },
    async remove(path) {
      try {
        await input.client.deleteObject({
          Bucket: input.bucket,
          Region: input.region,
          Key: path,
        });
      } catch (error) {
        if (!isCosObjectNotFoundError(error)) throw error;
      }
    },
    async createSignedUrl(path, expiresInSeconds) {
      const signedUrl = input.client.getObjectUrl({
        Bucket: input.bucket,
        Region: input.region,
        Key: path,
        Sign: true,
        Method: "GET",
        Expires: expiresInSeconds,
        Protocol: "https:",
        Query: {
          "response-content-disposition": "attachment; filename=original.txt",
        },
      });
      const parsed = new URL(signedUrl);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== expectedHost ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("invalid signed URL");
      }
      return parsed.toString();
    },
  };
}

export function createCosStorageProviderFromConfig(
  config: CosStorageServerConfig,
): CloudStorageProvider {
  const sdk = new COS({
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey,
  });
  const client: CosStorageClient = {
    async putObject(params) {
      await sdk.putObject({ ...params, Body: Buffer.from(params.Body) });
    },
    async deleteObject(params) {
      await sdk.deleteObject(params);
    },
    getObjectUrl(params) {
      return sdk.getObjectUrl(params);
    },
  };

  return createCosStorageProvider({
    bucket: config.cosBucket,
    region: config.cosRegion,
    client,
  });
}
