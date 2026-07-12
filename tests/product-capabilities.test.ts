import assert from "node:assert/strict";
import test from "node:test";

import {
  homePrototypeCopy,
  localPrototypeCapabilities,
} from "../src/lib/product-capabilities.ts";
import { uploadFilePolicy } from "../src/lib/upload/file-policy.ts";

test("home capability copy is derived from the local upload policy", () => {
  assert.deepEqual(localPrototypeCapabilities.supportedUploadFormats, ["TXT"]);
  assert.equal(localPrototypeCapabilities.maxUploadBytes, uploadFilePolicy.maxSizeBytes);
  assert.equal(
    homePrototypeCopy.uploadWorkflowDescription,
    "当前支持 2 MB 以内 TXT，并保存到当前账号的浏览器书架。",
  );
});

test("home capability copy clearly separates the prototype from pending integrations", () => {
  assert.doesNotMatch(homePrototypeCopy.heroTitle, /演示译本/);
  assert.match(homePrototypeCopy.summary, /当前原型支持 TXT 拆章、MCP 逐章翻译/);
  assert.match(homePrototypeCopy.summary, /真实翻译需要配置 MCP 与 OpenAI 兼容模型服务/);
  assert.match(homePrototypeCopy.translationWorkflowDescription, /通过已配置的 MCP 服务逐章生成真实译文/);
  assert.equal(localPrototypeCapabilities.mcpTranslationIntegration, true);
  assert.equal(localPrototypeCapabilities.realBilling, false);
  assert.equal(localPrototypeCapabilities.productionExport, false);
});
