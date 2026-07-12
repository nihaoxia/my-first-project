import assert from "node:assert/strict";
import test from "node:test";

import { buildButtonLinkProps } from "../src/components/ui/button-link-props.ts";

test("forwards accessible anchor attributes through the Button link branch", () => {
  const props = buildButtonLinkProps(
    {
      href: "/library",
      "aria-label": "书架",
      title: "打开书架",
      target: "_self",
    },
    "button-classes",
  );

  assert.deepEqual(props, {
    href: "/library",
    "aria-label": "书架",
    title: "打开书架",
    target: "_self",
    className: "button-classes",
  });
});
