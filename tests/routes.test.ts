import test from "node:test";
import assert from "node:assert/strict";

import { routeBuilders, routes } from "../src/lib/routes.ts";

test("route builders keep dynamic book and translation ids in generated paths", () => {
  assert.equal(routeBuilders.bookChapters("silent-archive"), "/books/silent-archive/chapters");
  assert.equal(routeBuilders.bookTranslate("silent-archive"), "/books/silent-archive/translate");
  assert.equal(routeBuilders.translationTasks("translation-silent-archive"), "/translations/translation-silent-archive/tasks");
  assert.equal(
    routeBuilders.reader({
      translationId: "translation/silent archive",
      chapterId: "chapter 2",
    }),
    "/reader?translationId=translation%2Fsilent+archive&chapterId=chapter+2",
  );
  assert.equal(routeBuilders.reader({ chapterId: "chapter-3" }), "/reader?chapterId=chapter-3");
});

test("demo routes are generated through the same dynamic route builders", () => {
  assert.equal(routes.chapters, routeBuilders.bookChapters("demo-book"));
  assert.equal(routes.translate, routeBuilders.bookTranslate("demo-book"));
  assert.equal(routes.tasks, routeBuilders.translationTasks("demo-translation"));
});
