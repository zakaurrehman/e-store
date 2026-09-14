"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export type ValueFormat = "money" | "money-compact" | "count";
const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  money: (value) => formatMoney(value),
  "money-compact": (value) => {
    const dollars = value / 100;
    if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
    if (dollars >= 10_000) return `$${(dollars / 1000).toFixed(1)}K`;
    return formatMoney(value);
  },
  count: (value) => value.toLocaleString("en-US"),
};

/*
 * Single-series SVG charts following the dataviz method: thin marks, recessive hairline grid,
 * crosshair tooltip on lines, per-mark tooltips on bars, values in text tokens, and a table view.
 * Series colour: brand iris (#3e30ec) — validated ≥3:1 on the white chart surface.
 */
const SERIES = "#3e30ec";
const GRID = "#e6e5df";
const AXIS = "#c3c2cb";

export type Point = { date: string; value: number };

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.5; value += step) ticks.push(value);
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(element);
    setWidth(Math.max(240, element.clientWidth));
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const shortDate = (iso: string, bucket: "day" | "week") => {
  const date = new Date(`${iso}T00:00:00Z`);
  return bucket === "week" ? `w/c ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-[0.75rem] text-ink-500 underline decoration-ink-300 underline-offset-2 hover:text-ink-950" aria-pressed={open}>
      {open ? "Show chart" : "View as table"}
    </button>
  );
}

function DataTable({ rows, valueLabel, format }: { rows: Array<{ label: string; value: number }>; valueLabel: string; format: (value: number) => string }) {
  return (
    <div className="max-h-64 overflow-auto rounded-sm border border-line">
      <table className="w-full text-[0.8125rem]">
        <thead className="sticky top-0 bg-canvas">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium text-ink-600">Period</th>
            <th className="px-3 py-1.5 text-right font-medium text-ink-600">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <td className="px-3 py-1.5 text-ink-800">{row.label}</td>
              <td className="tabular px-3 py-1.5 text-right text-ink-950">{format(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TimeSeriesChart({ points, bucket, format: formatKind, valueLabel, kind = "line", height = 220 }: { points: Point[]; bucket: "day" | "week"; format: ValueFormat; valueLabel: string; kind?: "line" | "column"; height?: number }) {
  const format = FORMATTERS[formatKind];
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const padding = { top: 12, right: 12, bottom: 28, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(...points.map((point) => point.value), 0);
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const x = (index: number) => padding.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => padding.top + innerHeight - (value / top) * innerHeight;
  const empty = points.every((point) => point.value === 0);

  if (table) {
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <TableToggle open onToggle={() => setTable(false)} />
        </div>
        <DataTable rows={points.map((point) => ({ label: shortDate(point.date, bucket), value: point.value }))} valueLabel={valueLabel} format={format} />
      </div>
    );
  }

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const areaPath = points.length ? `${linePath} L${x(points.length - 1).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${x(0).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z` : "";
  const slot = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const barWidth = Math.min(24, Math.max(3, slot - 2));
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 72))));
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex justify-end">
        <TableToggle open={false} onToggle={() => setTable(true)} />
      </div>
      <svg
        width={width}
        height={height}
        role="img"
        aria-labelledby={`${id}-title`}
        className="block"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const index = Math.round(((px - padding.left) / Math.max(1, innerWidth)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, index)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <title id={`${id}-title`}>{`${valueLabel} over time`}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padding.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-500" fontSize={11} fontVariant="tabular-nums">
              {format(tick)}
            </text>
          </g>
        ))}
        {points.map((point, index) =>
          (index % labelEvery === 0 && points.length - 1 - index >= Math.ceil(labelEvery / 2)) || index === points.length - 1 ? (
            <text key={point.date} x={x(index)} y={height - 8} textAnchor={index === points.length - 1 && points.length > 1 ? "end" : index === 0 ? "start" : "middle"} className="fill-ink-500" fontSize={11}>
              {shortDate(point.date, bucket)}
            </text>
          ) : null,
        )}
        {!empty && kind === "line" && (
          <>
            <path d={areaPath} fill={SERIES} fillOpacity={0.08} />
            <path d={linePath} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.length > 0 && <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />}
          </>
        )}
        {!empty &&
          kind === "column" &&
          points.map((point, index) => {
            const barHeight = Math.max(0, (point.value / top) * innerHeight);
            if (barHeight < 1) return null;
            const left = x(index) - barWidth / 2;
            const topY = padding.top + innerHeight - barHeight;
            return (
              <path
                key={point.date}
                d={barHeight >= 4 ? `M${left},${padding.top + innerHeight} V${topY + 4} a4,4 0 0 1 4,-4 h${Math.max(0, barWidth - 8)} a4,4 0 0 1 4,4 V${padding.top + innerHeight} Z` : `M${left},${padding.top + innerHeight} V${topY} h${barWidth} V${padding.top + innerHeight} Z`}
                fill={SERIES}
                fillOpacity={hover === index ? 1 : 0.85}
              />
            );
          })}
        {hovered && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={padding.top} y2={padding.top + innerHeight} stroke={AXIS} strokeWidth={1} />
            {kind === "line" && <circle cx={x(hover!)} cy={y(hovered.value)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />}
          </>
        )}
        {empty && (
          <text x={padding.left + innerWidth / 2} y={padding.top + innerHeight / 2} textAnchor="middle" className="fill-ink-400" fontSize={12}>
            No data for this period yet
          </text>
        )}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute z-10 rounded-sm bg-ink-950 px-2.5 py-1.5 text-[0.75rem] text-white shadow-pop" style={{ left: Math.min(width - 140, Math.max(0, x(hover!) - 60)), top: 28 }} role="status">
          <span className="block text-[0.6875rem] text-ink-300">{shortDate(hovered.date, bucket)}</span>
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES }} aria-hidden />
            {format(hovered.value)} <span className="font-normal text-ink-300">{valueLabel.toLowerCase()}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function HorizontalBars({ rows, format: formatKind, valueLabel, hrefBase }: { rows: Array<{ label: string; value: number; key: string }>; format: ValueFormat; valueLabel: string; hrefBase?: string }) {
  const format = FORMATTERS[formatKind];
  const hrefFor = hrefBase ? (key: string) => `${hrefBase}${key}` : undefined;
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...rows.map((row) => row.value), 0) || 1;
  if (rows.length === 0) return <p className="py-8 text-center text-[0.8125rem] text-ink-500">No sales in this period yet.</p>;
  if (table) {
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <TableToggle open onToggle={() => setTable(false)} />
        </div>
        <DataTable rows={rows.map((row) => ({ label: row.label, value: row.value }))} valueLabel={valueLabel} format={format} />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <TableToggle open={false} onToggle={() => setTable(true)} />
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const percent = (row.value / max) * 100;
          const content = (
            <>
              <span className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="truncate text-ink-800">{row.label}</span>
                <span className="tabular shrink-0 font-medium text-ink-950">{format(row.value)}</span>
              </span>
              <span className="mt-1 block h-2.5 w-full rounded-r-[4px] bg-canvas">
                <span className={cn("block h-full rounded-r-[4px] transition-[width] duration-500", hover === row.key ? "opacity-100" : "opacity-85")} style={{ width: `${Math.max(1, percent)}%`, background: SERIES }} />
              </span>
            </>
          );
          return (
            <li key={row.key} onPointerEnter={() => setHover(row.key)} onPointerLeave={() => setHover(null)} title={`${row.label}: ${format(row.value)}`}>
              {hrefFor ? (
                <a href={hrefFor(row.key)} className="block rounded-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-iris-500">
                  {content}
                </a>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
