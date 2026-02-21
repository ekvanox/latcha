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
  { name: "Latcha", value: 82 },
  { name: "reCAPTCHA v2", value: 79 },
];

const botData = [
  { name: "Latcha", value: 0 },
  { name: "reCAPTCHA v2", value: 80 },
];

// Custom label renderer for bot chart bars
const renderBotLabel = (props: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
  index?: number;
}) => {
  const { x = 0, y = 0, width = 0, value, index } = props;
  if (!value) return null;
  const isRecaptcha = index === 1;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="hsl(90 10% 35%)"
      textAnchor="middle"
      fontSize={13}
      fontWeight={600}
    >
      {value}%{isRecaptcha ? "*" : ""}
    </text>
  );
};

const StatBar = ({
  title,
  data,
  subtitle,
  showBotLabels,
  footnote,
}: {
  title: string;
  data: typeof humanData;
  subtitle: string;
  showBotLabels?: boolean;
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
            {showBotLabels && (
              <LabelList dataKey="value" content={renderBotLabel as never} />
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
      />
      <StatBar
        title="LLM Solve Rate"
        data={botData}
        subtitle="Lower is better"
        showBotLabels
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
