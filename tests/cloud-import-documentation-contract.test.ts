import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  homePrototypeCopy,
  localPrototypeCapabilities,
} from "../src/lib/product-capabilities.ts";

const readme = readFileSync("README.md", "utf8");
const roadmap = readFileSync("docs/ROADMAP.md", "utf8");
const devLog = readFileSync("docs/DEV_LOG.md", "utf8");

test("documents the completed same-account manual study import flow", () => {
  assert.match(readme, /同账号手动导入本地词汇、句子和笔记/u);
  assert.match(readme, /当前账号[^。；\n]*默认选中/u);
  assert.match(readme, /历史未分区[^。；\n]*默认不选/u);
  assert.match(readme, /检查和预览[^。；\n]*(?:不联网|零网络)/u);
  assert.match(readme, /执行前[^。；\n]*快照/u);
  assert.match(readme, /本地副本[^。；\n]*不删除/u);
  assert.match(readme, /服务端回执[^。；\n]*幂等/u);
});

test("keeps full library sync and real EdgeOne acceptance explicitly pending", () => {
  assert.match(roadmap, /阶段 15：同账号本地学习数据安全导入云端/u);
  assert.match(roadmap, /代码完成；真实免费环境执行受零费用门禁阻断/u);

  for (const document of [readme, roadmap]) {
    assert.match(document, /原书/u);
    assert.match(document, /译本/u);
    assert.match(document, /自动同步/u);
    assert.match(document, /云端自动备份/u);
    assert.match(document, /跨账号迁移/u);
    assert.match(document, /真实 EdgeOne[^。；\n]*(?:未执行|尚未执行|未完成)/u);
  }
});

test("records the zero-cost boundary without claiming real deployment acceptance", () => {
  assert.doesNotMatch(devLog, /部署已验证 Git SHA，运行真实免费域名 Smoke/u);
  assert.match(devLog, /待零费用门禁通过后，部署已验证的 Git SHA，并完成真实免费域名 Smoke/u);
  assert.match(devLog, /同账号本地学习数据安全导入云端/u);
  assert.match(devLog, /未创建、写入或调用 EdgeOne、Blob、KV、Models、COS/u);
  assert.match(devLog, /真实 EdgeOne[^。；\n]*(?:未执行|尚未执行|未完成)/u);
});

test("includes same-account manual study import in the product capability summary", () => {
  assert.equal(localPrototypeCapabilities.sameAccountManualStudyImport, true);
  assert.match(homePrototypeCopy.summary, /同账号手动导入本地词汇、句子和笔记/u);
  assert.match(homePrototypeCopy.summary, /不是[^。；\n]*(?:完整同步|自动同步)/u);
});
