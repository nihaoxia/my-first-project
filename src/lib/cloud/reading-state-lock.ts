export function readingStateLockKey(userId: string, kind: "original" | "translated", bookId: string) { return `reading-state\0${userId}\0${kind}\0${bookId}`; }
