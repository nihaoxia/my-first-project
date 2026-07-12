"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10">
      <section className="w-full max-w-lg rounded-xl border border-red-200 bg-[var(--surface)] p-7">
        <AlertTriangle aria-hidden="true" className="text-red-700" size={28} />
        <h1 className="mt-4 text-2xl font-semibold">页面暂时无法显示</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          本次操作没有完成。你可以重试；如果问题持续出现，请保留当前文件并稍后再试。
        </p>
        <Button className="mt-6" type="button" onClick={reset}>
          <RotateCcw aria-hidden="true" size={17} />
          重试
        </Button>
      </section>
    </main>
  );
}
