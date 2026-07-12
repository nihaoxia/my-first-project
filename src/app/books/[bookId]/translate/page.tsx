import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LocalTranslationCreate } from "@/components/translation/local-translation-create";
import { Button } from "@/components/ui/button";
import { TranslationCreatePanel } from "@/components/translation/translation-create-panel";
import { defaultMockAccount } from "@/lib/account/mock-account-summary";
import { isLocalLibraryBookId } from "@/lib/library/local-library-view";
import { chapters, originalBooks } from "@/lib/mock-data";
import { routeBuilders } from "@/lib/routes";
import { getAppSession } from "@/lib/auth/app-session";
import { CloudTranslationCreate } from "@/components/cloud/cloud-translation-create";
import { CloudBookError, getCloudBooksService } from "@/lib/cloud/books";

export default async function CreateTranslationPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const session = await getAppSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/books/${bookId}/translate`)}`);
  const localUserId = session.userId;

  if (session.authMode === "supabase") {
    let cloudBook;
    try {
      cloudBook = await getCloudBooksService().get(session.userId, bookId);
    } catch (error) { if (error instanceof CloudBookError && error.code === "BOOK_NOT_FOUND") notFound(); throw error; }
    return <AppShell requireAuth><CloudTranslationCreate bookId={cloudBook.id} bookTitle={cloudBook.title} /></AppShell>;
  }

  if (isLocalLibraryBookId(bookId)) {
    return (
      <AppShell requireAuth>
        <LocalTranslationCreate bookId={bookId} userId={localUserId} />
      </AppShell>
    );
  }

  const book = originalBooks.find((item) => item.id === bookId);

  if (!book) {
    notFound();
  }

  return (
    <AppShell requireAuth>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">创建译本</p>
          <h1 className="mt-1 text-3xl font-semibold">《{book.title}》</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            当前为本地演示流程：可验证章节选择和费用估算，但不会调用真实翻译或执行扣款。
          </p>
        </div>
        <Button href={routeBuilders.bookChapters(book.id)} variant="secondary">
          返回章节预览
        </Button>
      </div>

      <div className="mt-8">
        <TranslationCreatePanel
          userId={localUserId}
          originalBookId={book.id}
          sourceLanguage={book.language}
          account={defaultMockAccount}
          chapters={chapters}
        />
      </div>
    </AppShell>
  );
}
