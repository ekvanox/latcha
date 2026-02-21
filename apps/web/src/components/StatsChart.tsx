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
} from "recharts";

const humanData = [
  { name: "Latcha", value: 82 },
  { name: "reCAPTCHA v2", value: 79 },
];

const botData = [
  { name: "Latcha", value: 23 },
  { name: "reCAPTCHA v2", value: 68 },
];

const StatBar = ({
  title,
  data,
  subtitle,
}: {
  title: string;
  data: typeof humanData;
  subtitle: string;
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
          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={
                  entry.name === "Latcha" ? "hsl(82 50% 28%)" : "hsl(45 20% 70%)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
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
      />
    </div>
  );
};

export default StatsChart;
