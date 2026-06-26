import test from "node:test";
import assert from "node:assert/strict";

import { routeBuilders, routes } from "../src/lib/routes.ts";

test("route builders keep dynamic book and translation ids in generated paths", () => {
  assert.equal(routeBuilders.bookChapters("silent-archive"), "/books/silent-archive/chapters");
  assert.equal(routeBuilders.bookTranslate("silent-archive"), "/books/silent-archive/translate");
  assert.equal(routeBuilders.translationTasks("translation-silent-archive"), "/translations/translation-silent-archive/tasks");
});

test("demo routes are generated through the same dynamic route builders", () => {
  assert.equal(routes.chapters, routeBuilders.bookChapters("demo-book"));
  assert.equal(routes.translate, routeBuilders.bookTranslate("demo-book"));
  assert.equal(routes.tasks, routeBuilders.translationTasks("demo-translation"));
});
