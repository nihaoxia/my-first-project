import assert from "node:assert/strict";
import test from "node:test";

import {
  homePrototypeCopy,
  localPrototypeCapabilities,
} from "../src/lib/product-capabilities.ts";
import { uploadFilePolicy } from "../src/lib/upload/file-policy.ts";

test("home capability copy is derived from the local upload policy", () => {
  assert.deepEqual(localPrototypeCapabilities.supportedUploadFormats, ["TXT", "EPUB"]);
  assert.equal(localPrototypeCapabilities.maxUploadBytes, uploadFilePolicy.maxSizeBytes);
  assert.equal(
    homePrototypeCopy.uploadWorkflowDescription,
    "当前支持 2 MB 以内 TXT/EPUB，并保存到当前账号的浏览器书架；EPUB 只在浏览器本地提取文字，不上传原文件。",
  );
  assert.equal(localPrototypeCapabilities.browserLocalEpubImport, true);
  assert.equal(localPrototypeCapabilities.browserLocalEpubExport, true);
  assert.equal(localPrototypeCapabilities.browserLocalSpeechPlayback, true);
  assert.equal(localPrototypeCapabilities.browserLocalEncryptedBackup, true);
  assert.equal(localPrototypeCapabilities.browserLocalSelectiveRestore, true);
  assert.equal(localPrototypeCapabilities.browserLocalSafeBackupMerge, true);
  assert.equal(localPrototypeCapabilities.sameAccountManualStudyImport, true);
});

test("home capability copy clearly separates the prototype from pending integrations", () => {
  assert.doesNotMatch(homePrototypeCopy.heroTitle, /演示译本/);
  assert.match(homePrototypeCopy.summary, /当前原型支持 TXT 与 EPUB 本地拆章、MCP 逐章翻译/);
  assert.match(homePrototypeCopy.summary, /真实翻译需要配置 MCP 与 OpenAI 兼容模型服务/);
  assert.match(homePrototypeCopy.summary, /浏览器本地 TXT 与标准 EPUB 3 下载/);
  assert.match(homePrototypeCopy.summary, /浏览器本地语音朗读/);
  assert.match(
    homePrototypeCopy.summary,
    /浏览器本地加密备份、安全合并与按分类同账号恢复/,
  );
  assert.match(homePrototypeCopy.summary, /同账号手动导入本地词汇、句子和笔记/);
  assert.match(homePrototypeCopy.summary, /不是完整同步或自动同步/);
  assert.doesNotMatch(homePrototypeCopy.summary, /真实 EPUB 导出仍待接入/);
  assert.match(homePrototypeCopy.summary, /云端导出文件保存/);
  assert.match(homePrototypeCopy.translationWorkflowDescription, /通过已配置的 MCP 服务逐章生成真实译文/);
  assert.equal(localPrototypeCapabilities.mcpTranslationIntegration, true);
  assert.equal(localPrototypeCapabilities.realBilling, false);
  assert.equal(localPrototypeCapabilities.productionExport, false);
});
