export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{detail}</p> : null}
    </section>
  );
}
