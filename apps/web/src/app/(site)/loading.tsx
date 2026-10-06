/** Generic skeleton while a route segment streams in. Specific screens add their own shaped skeletons. */
export default function Loading() {
  return (
    <section className="sb-container page-body" aria-busy="true" aria-label="جاري التحميل">
      <span className="sb-skel loading-line" style={{ width: 160, height: 14 }} />
      <span className="sb-skel loading-line" style={{ width: '45%', height: 36, marginTop: 18 }} />
      <span className="sb-skel loading-line" style={{ width: '70%', height: 16, marginTop: 14 }} />
      <div className="loading-grid">
        {[0, 1, 2].map((i) => (
          <span key={i} className="sb-skel" style={{ height: 220, borderRadius: 12 }} />
        ))}
      </div>
    </section>
  );
}
