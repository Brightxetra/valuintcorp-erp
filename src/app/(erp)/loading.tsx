export default function ErpLoading() {
  return (
    <section className="space-y-6" aria-live="polite" aria-busy="true">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
    </section>
  );
}
