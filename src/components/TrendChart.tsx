"use client";

import type { TrendResult } from "@/lib/domain";

/**
 * A plain SVG line chart.
 *
 * No charting library: the only thing this chart has to do well is put the
 * legal limit on the same axis as the data, which is a dashed line and a label.
 * A dependency would have added more than it saved.
 */

const W = 900;
const H = 240;
const PAD = { top: 12, right: 16, bottom: 24, left: 40 };

export default function TrendChart({ trend }: { trend: TrendResult }) {
  const { points, limit, unit } = trend;
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const yMax = Math.max(limit, ...values) * 1.08;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const limitY = y(limit);

  const ticks = [0, yMax / 2, yMax];
  const firstDay = points[0].day;
  const lastDay = points[points.length - 1].day;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Media giornaliera, limite ${limit} ${unit}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--rule)"
          />
          <text
            x={PAD.left - 6}
            y={y(t) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--ink-soft)"
          >
            {Math.round(t)}
          </text>
        </g>
      ))}

      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={limitY}
        y2={limitY}
        stroke="var(--over)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <text
        x={W - PAD.right}
        y={limitY - 6}
        textAnchor="end"
        fontSize="11"
        fill="var(--over)"
      >
        limite {limit} {unit}
      </text>

      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.4" />

      {points.map((p, i) =>
        p.value > limit ? (
          <circle key={p.day} cx={x(i)} cy={y(p.value)} r="2.6" fill="var(--over)" />
        ) : null,
      )}

      <text x={PAD.left} y={H - 6} fontSize="11" fill="var(--ink-soft)">
        {firstDay}
      </text>
      <text
        x={W - PAD.right}
        y={H - 6}
        textAnchor="end"
        fontSize="11"
        fill="var(--ink-soft)"
      >
        {lastDay}
      </text>
    </svg>
  );
}
