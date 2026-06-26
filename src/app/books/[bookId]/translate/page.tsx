import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { TranslationCreatePanel } from "@/components/translation/translation-create-panel";
import { defaultMockAccount } from "@/lib/account/mock-account-summary";
import { chapters, originalBooks } from "@/lib/mock-data";
import { routeBuilders } from "@/lib/routes";

export default async function CreateTranslationPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = originalBooks.find((item) => item.id === bookId);

  if (!book) {
    notFound();
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">创建译本</p>
          <h1 className="mt-1 text-3xl font-semibold">《{book.title}》</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            选择目标语言和章节后，系统会先估算费用并检查余额；翻译完成后按实际结果结算。
          </p>
        </div>
        <Button href={routeBuilders.bookChapters(book.id)} variant="secondary">
          返回章节预览
        </Button>
      </div>

      <div className="mt-8">
        <TranslationCreatePanel
          userId="mock-user"
          originalBookId={book.id}
          sourceLanguage={book.language}
          account={defaultMockAccount}
          chapters={chapters}
        />
      </div>
    </AppShell>
  );
}
