type Point = { x: number; y: number; label?: string };

export default function Sparkline({
  points,
  width = 400,
  height = 100,
  color = "#f97316",
  fill = true,
}: {
  points: Point[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (points.length === 0) {
    return <div className="text-xs text-muted py-6 text-center">No data yet.</div>;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const sx = (x: number) => pad + (maxX === minX ? w / 2 : ((x - minX) / (maxX - minX)) * w);
  const sy = (y: number) => pad + (maxY === minY ? h / 2 : h - ((y - minY) / (maxY - minY)) * h);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${path} L ${sx(points[points.length - 1].x).toFixed(1)} ${height - pad} L ${sx(points[0].x).toFixed(1)} ${height - pad} Z`;

  return (
    <svg width={width} height={height} className="w-full h-auto">
      {fill && <path d={area} fill={color} opacity={0.15} />}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={color} />
      ))}
    </svg>
  );
}
