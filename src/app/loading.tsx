export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 lg:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          </div>
        </aside>
        <section className="space-y-6">
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
      </div>
    </main>
  );
}
