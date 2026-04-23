import Link from "next/link";

export default function NotFound() {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-6 py-6 shadow-[var(--shadow-soft)] max-[780px]:px-5 max-[780px]:py-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-[0.78rem] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          404
        </span>
        <h2 className="m-0 font-[var(--font-display)] text-[1.24rem] font-extrabold tracking-[-0.03em] text-[var(--text-strong)]">
          Not Found
        </h2>
      </div>
      <p className="mt-[18px] max-w-[54ch] text-base leading-[1.7] text-[var(--muted-strong)]">
        The requested page could not be found.
      </p>
      <div className="mt-5 mb-0 flex items-center justify-between gap-4 max-[640px]:flex-col max-[640px]:items-stretch">
        <Link
          className="inline-flex items-center gap-2 font-mono text-[0.88rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-strong)] transition hover:text-[var(--accent)]"
          href="/"
        >
          <span className="text-[var(--accent)]">&lt;</span>
          Back To List
        </Link>
      </div>
    </section>
  );
}
