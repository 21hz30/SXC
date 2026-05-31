/**
 * Lightweight SVG radar chart for 9 race axes (8 stations + avg run).
 *
 * Each axis carries a ratio = athleteActualSec ÷ benchmarkSec. By design,
 * 1.0 means "equal to benchmark" and lives on the bold ring. We render TWO
 * polygons:
 *   - the benchmark polygon (constant at 1.0) so the reference shape is obvious
 *   - the athlete polygon at the actual ratios
 *
 * Visual range is clamped to [0.4, 1.4] so a wild outlier doesn't blow up
 * the rest of the chart.
 */

export type RadarPoint = {
  label: string;
  /** ratio actual/benchmark; >1 = better than benchmark; null = no data */
  ratio: number | null;
  /** raw seconds (athlete & benchmark) — used for hover/inspection labels */
  actualSec?: number | null;
  benchmarkSec?: number | null;
};

export default function RadarChart({
  points,
  size = 320,
  color = "#f97316",
  benchmarkLabel = "Benchmark",
  athleteLabel = "This race",
}: {
  points: RadarPoint[];
  size?: number;
  color?: string;
  benchmarkLabel?: string;
  athleteLabel?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 36;
  const n = points.length;
  if (n < 3) return null;

  const clamp = (r: number | null) => {
    if (r == null) return 0;
    return Math.max(0.4, Math.min(1.4, r));
  };

  // unit position on the chart for a given axis index and radial value 0..1
  function pos(i: number, value: number) {
    // start at 12 o'clock, go clockwise
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = (value - 0.4) / (1.4 - 0.4); // map [0.4..1.4] → [0..1]
    return { x: cx + Math.cos(angle) * radius * Math.max(0, r), y: cy + Math.sin(angle) * radius * Math.max(0, r) };
  }
  function axisEnd(i: number) {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  }
  function labelPos(i: number) {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * (radius + 18), y: cy + Math.sin(angle) * (radius + 18) };
  }

  // grid rings at ratios 0.6, 0.8, 1.0 (benchmark), 1.2
  const rings = [0.6, 0.8, 1.0, 1.2];

  const athletePoly = points
    .map((p, i) => {
      const { x, y } = pos(i, clamp(p.ratio));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // benchmark polygon = constant 1.0 on every axis
  const benchmarkPoly = points
    .map((_, i) => {
      const { x, y } = pos(i, 1.0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const benchmarkColor = "#71717a"; // zinc-500

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="w-full h-auto">
        {/* rings */}
        {rings.map((r) => {
          const rr = ((r - 0.4) / (1.4 - 0.4)) * radius;
          return (
            <circle key={r} cx={cx} cy={cy} r={rr} fill="none" stroke="#e5e7eb" strokeWidth={1} strokeDasharray={r === 1.0 ? "0" : "3 3"} />
          );
        })}
        {/* axes */}
        {points.map((_, i) => {
          const end = axisEnd(i);
          return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e5e7eb" strokeWidth={1} />;
        })}

        {/* benchmark polygon (reference shape at ratio = 1.0) */}
        <polygon points={benchmarkPoly} fill={benchmarkColor} fillOpacity={0.06} stroke={benchmarkColor} strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />

        {/* athlete polygon (this race's ratios) */}
        <polygon points={athletePoly} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {/* athlete points + missing markers */}
        {points.map((p, i) => {
          if (p.ratio == null) {
            const end = axisEnd(i);
            return <circle key={`m-${i}`} cx={end.x} cy={end.y} r={2} fill="#d4d4d8" />;
          }
          const { x, y } = pos(i, clamp(p.ratio));
          return <circle key={`a-${i}`} cx={x} cy={y} r={3} fill={color} />;
        })}

        {/* axis labels with optional time pair */}
        {points.map((p, i) => {
          const { x, y } = labelPos(i);
          const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const anchor = Math.abs(Math.cos(angle)) < 0.3 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
          return (
            <text key={`l-${i}`} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-zinc-600" fontSize={10}>
              {p.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
          {athleteLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ borderTop: `2px dashed ${benchmarkColor}` }} />
          {benchmarkLabel}
        </span>
      </div>
    </div>
  );
}
