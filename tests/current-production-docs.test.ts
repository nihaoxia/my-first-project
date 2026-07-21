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

test("documents browser-local speech without claiming remote audio capabilities", () => {
  const readme = readFileSync("README.md", "utf8");
  const roadmap = readFileSync("docs/ROADMAP.md", "utf8");

  assert.match(readme, /只使用系统本地声音的浏览器本地语音朗读/u);
  assert.match(roadmap, /当前章节.*系统本地声音.*已完成/u);
  assert.doesNotMatch(readme, /^-[ \t]*语音朗读；$/mu);

  for (const document of [readme, roadmap]) {
    assert.match(document, /云端 TTS/u);
    assert.match(document, /远程声音/u);
    assert.match(document, /音频导出/u);
    assert.match(document, /跨章节后台连续播放/u);
    assert.doesNotMatch(document, /已接入云端语音|已生成音频文件/u);
  }
});

test("documents encrypted same-account backup without claiming cloud sync", () => {
  const readme = readFileSync("README.md", "utf8");
  const roadmap = readFileSync("docs/ROADMAP.md", "utf8");

  for (const document of [readme, roadmap]) {
    assert.match(document, /浏览器本地加密备份/u);
    assert.match(document, /口令.*无法找回/u);
    assert.match(document, /恢复.*整体替换/u);
    assert.match(document, /不会上传|不上传/u);
    assert.match(document, /云端同步/u);
    assert.match(document, /跨账号迁移/u);
    assert.match(document, /选择性恢复|自动合并/u);
    assert.match(document, /按分类.*整体替换|选择.*分类.*整体替换/u);
    assert.match(document, /原书.*译本.*一组|原书与译本.*关联组/u);
    assert.match(document, /自动合并.*未实现|仍未实现.*自动合并/u);
    assert.doesNotMatch(document, /选择性恢复.*仍未实现/u);
    assert.doesNotMatch(document, /已完成云端自动备份|已支持跨账号恢复/u);
  }
});
