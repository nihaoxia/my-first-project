export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 md:px-6" aria-busy="true">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 rounded bg-[var(--surface-2)]" />
        <div className="h-4 w-full max-w-xl rounded bg-[var(--surface-2)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-40 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            />
          ))}
        </div>
      </div>
      <p className="sr-only">页面加载中</p>
    </main>
  );
}
