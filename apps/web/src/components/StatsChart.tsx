"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

const humanData = [
  { name: "Latcha", value: 93 },
  { name: "reCAPTCHA v2", value: 92 },
];

const botData = [
  { name: "Latcha", value: 0 },
  { name: "reCAPTCHA v2", value: 80 },
];

// Returns a label renderer that appends `suffixes[index]` after the percentage
const makeLabelRenderer =
  (suffixes: string[]) =>
  (props: {
    x?: number;
    y?: number;
    width?: number;
    value?: number;
    index?: number;
  }) => {
    const { x = 0, y = 0, width = 0, value, index = 0 } = props;
    if (value === undefined || value === null) return null;
    const suffix = suffixes[index] ?? "";
    return (
      <text
        x={x + width / 2}
        y={y - 6}
        fill="hsl(90 10% 35%)"
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
      >
        {value}%{suffix}
      </text>
    );
  };

const renderHumanLabel = makeLabelRenderer(["", "**"]);
const renderBotLabel = makeLabelRenderer(["", "*"]);

const StatBar = ({
  title,
  data,
  subtitle,
  labelRenderer,
  footnote,
}: {
  title: string;
  data: typeof humanData;
  subtitle: string;
  labelRenderer?: (props: Record<string, unknown>) => React.ReactElement | null;
  footnote?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center gap-4">
    <h3 className="text-2xl font-serif text-foreground">{title}</h3>
    <p className="text-sm text-muted-foreground">{subtitle}</p>
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(45 20% 85%)" />
          <XAxis
            dataKey="name"
            tick={{ fill: "hsl(90 10% 45%)", fontSize: 14 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "hsl(90 10% 45%)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(45 33% 94%)",
              border: "1px solid hsl(45 20% 85%)",
              borderRadius: "0.75rem",
              fontFamily: "Inter",
            }}
            formatter={(value: number | undefined) => [`${value ?? ""}%`]}
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} minPointSize={1}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={
                  entry.name === "Latcha"
                    ? "hsl(82 50% 28%)"
                    : "hsl(45 20% 70%)"
                }
              />
            ))}
            {labelRenderer && (
              <LabelList dataKey="value" content={labelRenderer as never} />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    {footnote && (
      <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed mt-1">
        {footnote}
      </p>
    )}
  </div>
);

const StatsChart = () => {
  return (
    <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
      <StatBar
        title="Human Solve Rate"
        data={humanData}
        subtitle="Higher is better"
        labelRenderer={renderHumanLabel}
        footnote={
          <>
            ** reCAPTCHA v2 human solve rate sourced from academic research.{" "}
            <a
              href="https://www.ndss-symposium.org/wp-content/uploads/usec25-21.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Source: NDSS USEC, 2025
            </a>
          </>
        }
      />
      <StatBar
        title="LLM Solve Rate"
        data={botData}
        subtitle="Lower is better"
        labelRenderer={renderBotLabel}
        footnote={
          <>
            * GPT-4V achieved an ~80% success rate against reCAPTCHA v2 in
            independent testing.{" "}
            <a
              href="https://cheq.ai/blog/testing-ai-gpt-4v-against-captcha/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Source: CHEQ, 2024
            </a>
          </>
        }
      />
    </div>
  );
};

export default StatsChart;
