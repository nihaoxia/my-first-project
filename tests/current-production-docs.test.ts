import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("documents EdgeOne as the current zero-cost production architecture", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /EdgeOne Makers/);
  assert.match(readme, /用户名和密码/);
  assert.match(readme, /Blob/);
  assert.match(readme, /译本 TXT[\s\S]*笔记 Markdown/);
  assert.doesNotMatch(readme, /生产目标固定为腾讯云广州：Linux 云服务器/);
  assert.doesNotMatch(readme, /生产使用仍需部署 Supabase migration、配置短信供应商/);
});

test("records safe EPUB import and real local EPUB 3 export as completed", () => {
  const readme = readFileSync("README.md", "utf8");
  const roadmap = readFileSync("docs/ROADMAP.md", "utf8");

  assert.match(readme, /无 DRM、可重排 EPUB 2\/3 文字书导入/);
  assert.match(readme, /标准 EPUB 3[^\n]*浏览器本地打包和下载/);
  assert.match(roadmap, /真实浏览器文本与 EPUB 二进制下载[^\n]*已完成/);
  assert.match(roadmap, /EPUB ZIP\/XML\/OPF\/spine\/nav\/NCX 安全解析[^\n]*已完成/);
  assert.match(roadmap, /标准 EPUB 3[^\n]*真实二进制打包[^\n]*已完成/);

  for (const document of [readme, roadmap]) {
    assert.doesNotMatch(document, /EPUB 导出草稿/);
    assert.doesNotMatch(document, /真正的 EPUB 二进制打包与下载/);
    assert.doesNotMatch(document, /真实 EPUB[^\n]*(?:尚未|仍待接入)/);
    assert.match(document, /MOBI[^\n]*PDF/);
    assert.match(document, /封面[^\n]*图片[^\n]*字体[^\n]*固定布局[^\n]*DRM/);
    assert.match(document, /云端导出文件保存/);
  }
});
