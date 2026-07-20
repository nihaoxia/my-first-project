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

test("records real browser text downloads and distinguishes EPUB import from export", () => {
  const roadmap = readFileSync("docs/ROADMAP.md", "utf8");

  assert.match(roadmap, /真实浏览器文本下载[^\n]*已完成/);
  assert.doesNotMatch(roadmap, /真实浏览器文件下载尚未接入/);
  assert.match(roadmap, /EPUB ZIP\/XML\/OPF\/spine\/nav\/NCX 安全解析[^\n]*已完成/);
  assert.match(roadmap, /真实 EPUB[^\n]*尚未/);
});
