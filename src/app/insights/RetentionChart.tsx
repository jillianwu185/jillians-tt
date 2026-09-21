type CsvRow = Record<string, string>;

const WATCH_TIME_COLOR = "#2a78d6"; // categorical slot 1 (blue)
const RETENTION_COLOR = "#eb6834"; // categorical slot 2 (orange)

function findColumn(row: CsvRow, ...keywords: string[]): string | null {
  const key = Object.keys(row).find((k) =>
    keywords.some((kw) => k.toLowerCase().includes(kw))
  );
  return key ?? null;
}

export default function RetentionChart({ rows }: { rows: CsvRow[] }) {
  if (rows.length === 0) return null;

  const labelKey =
    findColumn(rows[0], "title", "name", "video") ?? Object.keys(rows[0])[0];
  const watchTimeKey = findColumn(rows[0], "watch");
  const retentionKey = findColumn(rows[0], "retention");

  if (!watchTimeKey && !retentionKey) {
    return (
      <p className="text-sm text-neutral-500">
        This import doesn&apos;t have recognizable watch-time or retention columns to chart.
      </p>
    );
  }

  const barWidth = 18;
  const groupWidth = 64;
  const chartHeight = 160;
  const chartWidth = rows.length * groupWidth;

  function valueOf(row: CsvRow, key: string | null): number {
    if (!key) return 0;
    const parsed = parseFloat(row[key]);
    return Number.isFinite(parsed) ? Math.min(parsed, 100) : 0;
  }

  return (
    <div className="viz-root" style={{ colorScheme: "light" }}>
      <div className="mb-2 flex gap-4 text-xs text-neutral-600">
        {watchTimeKey && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: WATCH_TIME_COLOR }}
            />
            Avg. watch time %
          </span>
        )}
        {retentionKey && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: RETENTION_COLOR }}
            />
            Retention %
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`}
        width="100%"
        style={{ maxWidth: chartWidth, overflow: "visible" }}
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <line
            key={tick}
            x1={0}
            x2={chartWidth}
            y1={chartHeight - (tick / 100) * chartHeight}
            y2={chartHeight - (tick / 100) * chartHeight}
            stroke="#e5e5e0"
            strokeWidth={1}
          />
        ))}

        {rows.map((row, i) => {
          const groupX = i * groupWidth;
          const watchTimeValue = valueOf(row, watchTimeKey);
          const retentionValue = valueOf(row, retentionKey);
          const label = row[labelKey] ?? `Video ${i + 1}`;

          return (
            <g key={i}>
              {watchTimeKey && (
                <rect
                  x={groupX + groupWidth / 2 - barWidth - 2}
                  y={chartHeight - (watchTimeValue / 100) * chartHeight}
                  width={barWidth}
                  height={(watchTimeValue / 100) * chartHeight}
                  fill={WATCH_TIME_COLOR}
                  rx={4}
                >
                  <title>
                    {label}: {watchTimeValue}% avg watch time
                  </title>
                </rect>
              )}
              {retentionKey && (
                <rect
                  x={groupX + groupWidth / 2 + 2}
                  y={chartHeight - (retentionValue / 100) * chartHeight}
                  width={barWidth}
                  height={(retentionValue / 100) * chartHeight}
                  fill={RETENTION_COLOR}
                  rx={4}
                >
                  <title>
                    {label}: {retentionValue}% retention
                  </title>
                </rect>
              )}
              <text
                x={groupX + groupWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#52514e"
              >
                {label.length > 10 ? `${label.slice(0, 9)}…` : label}
              </text>
            </g>
          );
        })}
      </svg>

      <details className="mt-3 text-xs text-neutral-500">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr>
              {Object.keys(rows[0]).map((key) => (
                <th key={key} className="border-b border-neutral-200 py-1 pr-3 font-medium">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {Object.keys(rows[0]).map((key) => (
                  <td key={key} className="border-b border-neutral-100 py-1 pr-3">
                    {row[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
