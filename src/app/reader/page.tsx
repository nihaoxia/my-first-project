import { AppShell } from "@/components/app-shell";
import { LocalTranslationReader } from "@/components/reader/local-translation-reader";
import { ReaderWorkspace } from "@/components/reader/reader-workspace";
import { buildStageSevenReaderView, translatedBooks } from "@/lib/mock-data";
import { getAppSession } from "@/lib/auth/app-session";
import { redirect } from "next/navigation";
import { CloudTranslationReader } from "@/components/cloud/cloud-translation-reader";
import { routes } from "@/lib/routes";

export default async function ReaderPage({
  searchParams,
}: {
  searchParams?: Promise<{ translationId?: string; chapterId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const localTranslationId = resolvedSearchParams?.translationId;
  const session = await getAppSession();
  if (!session) redirect(`/login?next=${encodeURIComponent("/reader")}`);

  if (process.env.AUTH_MODE === "edgeone" && localTranslationId) {
    return <AppShell wide requireAuth><CloudTranslationReader userId={session.user.id} translationId={localTranslationId} chapterId={resolvedSearchParams?.chapterId} /></AppShell>;
  }
  if (process.env.AUTH_MODE === "edgeone") redirect(routes.library);

  if (localTranslationId?.startsWith("local-translation-")) {
    return (
      <AppShell wide requireAuth>
        <LocalTranslationReader
          translationId={localTranslationId}
          chapterId={resolvedSearchParams?.chapterId}
        />
      </AppShell>
    );
  }

  const translation = translatedBooks[0];
  const readerView = buildStageSevenReaderView(resolvedSearchParams?.chapterId);

  return (
    <AppShell wide requireAuth>
      <ReaderWorkspace title={translation.title} readerView={readerView} />
    </AppShell>
  );
}
