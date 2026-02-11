import { useMemo } from "react";

export type PolarizationEllipsePreviewProps = {
  aAmp: number;
  aPhaseDeg: number;
  bAmp: number;
  bPhaseDeg: number;
  size?: number;
};

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function safeNum(n: unknown, fallback: number) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export default function PolarizationEllipsePreview(props: PolarizationEllipsePreviewProps) {
  const size = props.size ?? 140;

  const pts = useMemo(() => {
    const aAmp = Math.max(0, safeNum(props.aAmp, 0));
    const bAmp = Math.max(0, safeNum(props.bAmp, 0));
    const aPhi = toRad(safeNum(props.aPhaseDeg, 0));
    const bPhi = toRad(safeNum(props.bPhaseDeg, 0));

    const ampMax = Math.max(1e-12, aAmp, bAmp);
    const scale = 0.42 * size;

    const steps = 160;
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const ex = (aAmp / ampMax) * Math.cos(t + aPhi);
      const ey = (bAmp / ampMax) * Math.cos(t + bPhi);
      out.push([ex * scale, ey * scale]);
    }
    return out;
  }, [props.aAmp, props.aPhaseDeg, props.bAmp, props.bPhaseDeg, size]);

  const d = pts.length
    ? `M ${pts
        .map(([x, y]) => {
          // SVG y-axis down
          const sx = x + size / 2;
          const sy = -y + size / 2;
          return `${sx.toFixed(2)} ${sy.toFixed(2)}`;
        })
        .join(" L ")}`
    : "";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        display: "block",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <line
        x1={size / 2}
        y1={8}
        x2={size / 2}
        y2={size - 8}
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={1}
      />
      <line
        x1={8}
        y1={size / 2}
        x2={size - 8}
        y2={size / 2}
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={1}
      />

      {d ? (
        <path d={d} fill="none" stroke="#38bdf8" strokeWidth={2} opacity={0.9} />
      ) : null}

      <circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.42}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
      />
    </svg>
  );
}
