"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface Props {
  data: number[];
  color?: string;
}

export default function TrustSparkline({ data, color = "#6366f1" }: Props) {
  const points = data.map((v, i) => ({ i, v }));

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <YAxis domain={[0, 1]} hide />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
