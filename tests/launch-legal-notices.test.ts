import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaunchLegalNotices,
  getLegalNoticesForSurface,
} from "../src/lib/launch/legal-notices.ts";

test("builds copyright privacy and public beta notices", () => {
  const notices = getLaunchLegalNotices();
  const text = notices.map((notice) => `${notice.title}\n${notice.message}`).join("\n");

  assert.match(text, /有权处理/);
  assert.match(text, /私人书架/);
  assert.match(text, /不会公开分享/);
  assert.match(text, /不提供.*资源搜索/);
  assert.match(text, /不提供.*公开书库/);
});

test("filters notices for upload and home surfaces", () => {
  const uploadNotices = getLegalNoticesForSurface("upload");
  const homeNotices = getLegalNoticesForSurface("home");

  assert.ok(uploadNotices.some((notice) => notice.id === "copyright"));
  assert.ok(uploadNotices.some((notice) => notice.id === "privacy"));
  assert.ok(homeNotices.some((notice) => notice.id === "public-beta"));
  assert.ok(homeNotices.every((notice) => notice.message.length > 0));
});
