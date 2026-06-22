export const routes = {
  home: "/",
  login: "/login",
  library: "/library",
  upload: "/upload",
  chapters: "/books/demo-book/chapters",
  translate: "/books/demo-book/translate",
  tasks: "/translations/demo-translation/tasks",
  reader: "/reader",
  vocabulary: "/study/vocabulary",
  sentences: "/study/sentences",
  admin: "/admin",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
