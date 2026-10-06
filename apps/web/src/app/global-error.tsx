'use client';

/**
 * Last-resort boundary when the root layout itself fails. It replaces the whole document,
 * so it cannot rely on the design-system stylesheet; minimal inline styling only.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f7f5f0',
          color: '#14201d',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22 }}>حصلت مشكلة عندنا</h1>
          <p style={{ color: '#4a5652' }}>ما اتخصمش أي مبلغ. جرّب تاني بعد ثواني.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 44,
              padding: '0 18px',
              borderRadius: 8,
              border: 0,
              background: '#0f6b5a',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            جرّب تاني
          </button>
        </div>
      </body>
    </html>
  );
}
