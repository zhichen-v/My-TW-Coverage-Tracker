import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel detail-block">
      <div className="section-header">
        <span className="section-index">404</span>
        <h2>Not Found</h2>
      </div>
      <p className="hero-desc">The requested page could not be found.</p>
      <div className="page-actions" style={{ marginBottom: 0, marginTop: 20 }}>
        <Link className="back-link" href="/">
          Back To List
        </Link>
      </div>
    </section>
  );
}
