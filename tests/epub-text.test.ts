import assert from "node:assert/strict";
import test from "node:test";
import { strToU8 } from "fflate";

import { extractEpubDocumentText } from "../src/lib/upload/epub-text.ts";
import { parseEpubXml } from "../src/lib/upload/epub-xml.ts";

function extract(source: string) {
  return extractEpubDocumentText(parseEpubXml(strToU8(source)));
}

test("extracts heading, document title, and normalized paragraph text", () => {
  const result = extract(`
    <html><head><title>文档标题</title></head><body>
      <h2> 第一章 雾起 </h2>
      <p>第一段 <em>继续</em>。</p><div>第二段<br/>换行。</div>
    </body></html>`);
  assert.deepEqual(result, {
    heading: "第一章 雾起",
    documentTitle: "文档标题",
    content: "第一章 雾起\n\n第一段 继续。\n\n第二段\n\n换行。",
  });
});

test("ignores active, styling, navigation, vector, math, and embedded subtrees", () => {
  const result = extract(`
    <html><body><p>保留</p>
      <script>evil()</script><style>.x{}</style><noscript>备用</noscript>
      <svg><text>图形</text></svg><math><mi>x</mi></math><nav>目录</nav><aside>旁注</aside>
      <object>对象</object><embed>嵌入</embed><iframe>框架</iframe><audio>声音</audio><video>视频</video>
      <p>结尾</p>
    </body></html>`);
  assert.equal(result.content, "保留\n\n结尾");
});

test("returns empty content for documents without readable body text", () => {
  assert.deepEqual(extract("<html><head><title>空白</title></head><body><script>x</script></body></html>"), {
    heading: null,
    documentTitle: "空白",
    content: "",
  });
});
