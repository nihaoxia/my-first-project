export const routeBuilders = {
  bookChapters: (bookId: string) => `/books/${encodeURIComponent(bookId)}/chapters`,
  bookTranslate: (bookId: string) => `/books/${encodeURIComponent(bookId)}/translate`,
  translationTasks: (translationId: string) => `/translations/${encodeURIComponent(translationId)}/tasks`,
  reader: (input: { translationId?: string; chapterId?: string } = {}) => {
    const searchParams = new URLSearchParams();

    if (input.translationId) {
      searchParams.set("translationId", input.translationId);
    }

    if (input.chapterId) {
      searchParams.set("chapterId", input.chapterId);
    }

    const query = searchParams.toString();
    return query ? `/reader?${query}` : "/reader";
  },
} as const;

export const routes = {
  home: "/",
  login: "/login",
  library: "/library",
  upload: "/upload",
  chapters: routeBuilders.bookChapters("demo-book"),
  translate: routeBuilders.bookTranslate("demo-book"),
  tasks: routeBuilders.translationTasks("demo-translation"),
  reader: routeBuilders.reader(),
  vocabulary: "/study/vocabulary",
  sentences: "/study/sentences",
  notes: "/study/notes",
  me: "/me",
  admin: "/admin",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
