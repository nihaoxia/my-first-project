import assert from "node:assert/strict";
import test from "node:test";

import {
  createCosStorageProvider,
  isCosObjectNotFoundError,
  type CosStorageClient,
} from "../src/lib/cloud/cos-storage-provider.ts";

const bucket = "original-books-1250000000";
const region = "ap-guangzhou";
const objectPath =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original.txt";

function createClient(overrides: Partial<CosStorageClient> = {}): CosStorageClient {
  return {
    async putObject() {},
    async deleteObject() {},
    getObjectUrl() {
      return `https://${bucket}.cos.${region}.myqcloud.com/${objectPath}?q-signature=test`;
    },
    ...overrides,
  };
}

test("COS provider uploads private TXT and creates a bounded attachment URL", async () => {
  const calls: Array<{ operation: string; params: Record<string, unknown> }> = [];
  const provider = createCosStorageProvider({
    bucket,
    region,
    client: createClient({
      async putObject(params) {
        calls.push({ operation: "putObject", params });
      },
      getObjectUrl(params) {
        calls.push({ operation: "getObjectUrl", params });
        return `https://${bucket}.cos.${region}.myqcloud.com/${objectPath}?response-content-disposition=attachment&q-signature=test`;
      },
    }),
  });

  const bytes = new TextEncoder().encode("text");
  await provider.upload(objectPath, bytes);
  const url = await provider.createSignedUrl(objectPath, 60);

  assert.deepEqual(calls[0], {
    operation: "putObject",
    params: {
      Bucket: bucket,
      Region: region,
      Key: objectPath,
      Body: bytes,
      ContentType: "text/plain; charset=utf-8",
      ContentDisposition: "attachment; filename=original.txt",
    },
  });
  assert.deepEqual(calls[1], {
    operation: "getObjectUrl",
    params: {
      Bucket: bucket,
      Region: region,
      Key: objectPath,
      Sign: true,
      Method: "GET",
      Expires: 60,
      Protocol: "https:",
      Query: {
        "response-content-disposition": "attachment; filename=original.txt",
      },
    },
  });
  assert.match(url, /^https:\/\//);
  assert.equal(url.includes("q-signature=test"), true);
});

test("COS provider removes objects and treats only explicit missing objects as idempotent", async () => {
  const removed: string[] = [];
  const success = createCosStorageProvider({
    bucket,
    region,
    client: createClient({
      async deleteObject(params) {
        removed.push(params.Key);
      },
    }),
  });
  const missing = createCosStorageProvider({
    bucket,
    region,
    client: createClient({
      async deleteObject() {
        throw { statusCode: 404, code: "NoSuchKey" };
      },
    }),
  });

  await success.remove(objectPath);
  await missing.remove(objectPath);

  assert.deepEqual(removed, [objectPath]);
  assert.equal(isCosObjectNotFoundError({ statusCode: 404, code: "NoSuchKey" }), true);
  assert.equal(isCosObjectNotFoundError({ statusCode: 500, code: "NoSuchKey" }), false);
  assert.equal(isCosObjectNotFoundError(new Error("NoSuchKey")), false);
});

test("COS provider propagates provider failures for the stable storage boundary", async () => {
  const upload = createCosStorageProvider({
    bucket,
    region,
    client: createClient({
      async putObject() {
        throw new Error("private COS upload response");
      },
    }),
  });
  const remove = createCosStorageProvider({
    bucket,
    region,
    client: createClient({
      async deleteObject() {
        throw { statusCode: 403, code: "AccessDenied" };
      },
    }),
  });

  await assert.rejects(upload.upload(objectPath, new Uint8Array([1])));
  await assert.rejects(remove.remove(objectPath));
});

test("COS provider rejects invalid signed URL origins", async () => {
  const provider = createCosStorageProvider({
    bucket,
    region,
    client: createClient({
      getObjectUrl() {
        return "https://attacker.example/signed";
      },
    }),
  });

  await assert.rejects(provider.createSignedUrl(objectPath, 60), /invalid signed URL/);
});
