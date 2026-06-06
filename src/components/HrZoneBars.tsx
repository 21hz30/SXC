// Read-only HR-zone distribution: a stacked Z1→Z5 bar, optionally with a
// per-zone time + % legend. Pure presentational — usable in both server and
// client components. `zones` is time-in-zone in SECONDS, index 0 = Z1.
const ZONE_COLORS = ["bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-orange-500", "bg-red-500"];

export default function HrZoneBars({
  zones,
  showLegend = false,
}: {
  zones: (number | null | undefined)[];
  showLegend?: boolean;
}) {
  const z = [0, 1, 2, 3, 4].map((i) => zones[i] ?? 0);
  const total = z.reduce((a, s) => a + s, 0);
  if (total <= 0) return null;
  const pct = z.map((s) => Math.round((s / total) * 100));
  const title = z.map((s, i) => `Zone ${i + 1} ${Math.round(s / 60)}m (${pct[i]}%)`).join(" · ");

  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-background" title={title}>
        {z.map((s, i) => (s > 0 ? <div key={i} className={ZONE_COLORS[i]} style={{ width: `${(s / total) * 100}%` }} /> : null))}
      </div>
      {showLegend && (
        <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px]">
          {z.map((s, i) => (
            <div key={i}>
              <div className="flex items-center justify-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-sm ${ZONE_COLORS[i]}`} />Zone {i + 1}
              </div>
              <div className="text-muted tabular-nums">{Math.round(s / 60)}m · {pct[i]}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
