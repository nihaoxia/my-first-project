export const routeBuilders = {
  bookChapters: (bookId: string) => `/books/${encodeURIComponent(bookId)}/chapters`,
  bookTranslate: (bookId: string) => `/books/${encodeURIComponent(bookId)}/translate`,
  translationTasks: (translationId: string) => `/translations/${encodeURIComponent(translationId)}/tasks`,
} as const;

export const routes = {
  home: "/",
  login: "/login",
  library: "/library",
  upload: "/upload",
  chapters: routeBuilders.bookChapters("demo-book"),
  translate: routeBuilders.bookTranslate("demo-book"),
  tasks: routeBuilders.translationTasks("demo-translation"),
  reader: "/reader",
  vocabulary: "/study/vocabulary",
  sentences: "/study/sentences",
  notes: "/study/notes",
  me: "/me",
  admin: "/admin",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
