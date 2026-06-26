import { AppShell } from "@/components/app-shell";
import { ReaderWorkspace } from "@/components/reader/reader-workspace";
import { stageSevenReaderView, translatedBooks } from "@/lib/mock-data";

export default function ReaderPage() {
  const translation = translatedBooks[0];
  const readerView = stageSevenReaderView;

  return (
    <AppShell wide>
      <ReaderWorkspace title={translation.title} readerView={readerView} />
    </AppShell>
  );
}
