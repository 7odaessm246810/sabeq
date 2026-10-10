/** An amount in pounds: the number in the numeric face, «ج.م» after it (right-to-left safe). */
export function Money({ egp }: { egp: number }) {
  return (
    <>
      <span className="sb-num">
        {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(egp)}
      </span>{' '}
      ج.م
    </>
  );
}
