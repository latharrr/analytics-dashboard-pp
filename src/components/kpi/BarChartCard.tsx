"use client";

import { useState } from "react";
import { formatValue, humanizeKey } from "@/lib/format";

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartCardProps {
  title: string;
  data: BarDatum[];
  valueLabel?: string;
}

const WIDTH = 560;
const HEIGHT = 220;
const PADDING_LEFT = 36;
const PADDING_BOTTOM = 28;
const PADDING_TOP = 12;

export function BarChartCard({ title, data, valueLabel = "value" }: BarChartCardProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  if (!data.length) {
    return (
      <div className="viz-root rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-medium text-ink">{title}</h3>
        <p className="text-sm text-ink-muted">No data yet.</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const plotWidth = WIDTH - PADDING_LEFT - 8;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const barGap = 8;
  const barWidth = Math.max(6, plotWidth / data.length - barGap);

  const gridLines = 4;

  return (
    <div className="viz-root rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <button
          onClick={() => setShowTable((s) => !s)}
          className="text-xs text-ink-muted underline decoration-dotted"
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="pb-1 font-normal">Label</th>
              <th className="pb-1 font-normal">{humanizeKey(valueLabel)}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-border">
                <td className="py-1 text-ink">{d.label}</td>
                <td className="py-1 text-ink">{formatValue(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={title}>
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = PADDING_TOP + (plotHeight / gridLines) * i;
            return (
              <line
                key={i}
                x1={PADDING_LEFT}
                x2={WIDTH - 8}
                y1={y}
                y2={y}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
            );
          })}
          <line
            x1={PADDING_LEFT}
            x2={PADDING_LEFT}
            y1={PADDING_TOP}
            y2={HEIGHT - PADDING_BOTTOM}
            stroke="var(--viz-baseline)"
            strokeWidth={1}
          />
          <line
            x1={PADDING_LEFT}
            x2={WIDTH - 8}
            y1={HEIGHT - PADDING_BOTTOM}
            y2={HEIGHT - PADDING_BOTTOM}
            stroke="var(--viz-baseline)"
            strokeWidth={1}
          />

          {[0, max / 2, max].map((v, i) => (
            <text
              key={i}
              x={PADDING_LEFT - 6}
              y={HEIGHT - PADDING_BOTTOM - (plotHeight / 2) * i + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--viz-text-muted)"
            >
              {Math.round(v)}
            </text>
          ))}

          {data.map((d, i) => {
            const barHeight = (d.value / max) * plotHeight;
            const x = PADDING_LEFT + i * (barWidth + barGap) + barGap / 2;
            const y = HEIGHT - PADDING_BOTTOM - barHeight;
            const isHovered = hovered === i;
            return (
              <g
                key={d.label}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 1)}
                  rx={4}
                  fill={isHovered ? "var(--viz-seq-450)" : "var(--viz-seq-400)"}
                />
                <text
                  x={x + barWidth / 2}
                  y={HEIGHT - PADDING_BOTTOM + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--viz-text-muted)"
                >
                  {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
                </text>
                {isHovered && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--viz-text-primary)"
                  >
                    {formatValue(d.value)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
