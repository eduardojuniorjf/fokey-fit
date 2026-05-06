import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Range = "week" | "15d" | "30d" | "year";

interface HabitRow {
  id: string;
  name: string;
  daily_target: number;
  unit: string | null;
  icon: string;
}

interface LogRow {
  habit_id: string;
  logged_for: string;
  value: number;
}

const WATER_ICON = "water";
const CUP_ML = 350;

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface HabitsHistoryCardProps {
  userId: string | undefined;
  habit: HabitRow;
}

export function HabitsHistoryCard({ userId, habit }: HabitsHistoryCardProps) {
  const [range, setRange] = useState<Range>("week");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const isWater = habit.icon === WATER_ICON;

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    let start: Date;
    if (range === "week") {
      const dow = today.getDay();
      const diffToMonday = dow === 0 ? -6 : 1 - dow;
      start = new Date(today);
      start.setDate(today.getDate() + diffToMonday);
      end.setDate(start.getDate() + 6);
    } else if (range === "15d") {
      start = new Date(today);
      start.setDate(today.getDate() - 14);
    } else if (range === "30d") {
      start = new Date(today);
      start.setDate(today.getDate() - 29);
    } else {
      start = new Date(today);
      start.setDate(today.getDate() - 364);
    }
    return { startDate: start, endDate: end };
  }, [range]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("habit_logs")
        .select("habit_id,logged_for,value")
        .eq("habit_id", habit.id)
        .gte("logged_for", isoDate(startDate))
        .lte("logged_for", isoDate(endDate));
      if (cancelled) return;
      setLogs((data ?? []) as LogRow[]);
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [userId, habit.id, startDate, endDate]);

  // Build day-by-day data
  const { data, unitLabel, targetValue } = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const lg of logs) {
      byDate.set(lg.logged_for, (byDate.get(lg.logged_for) ?? 0) + Number(lg.value));
    }

    let unit: string;
    let target: number;
    if (isWater) {
      unit = "L";
      target = (Number(habit.daily_target) * CUP_ML) / 1000;
    } else {
      unit = habit.unit ?? "";
      target = Number(habit.daily_target) || 1;
    }

    const days: { date: string; full: string; valor: number; meta: number }[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const iso = isoDate(cursor);
      const raw = byDate.get(iso) ?? 0;
      const valor = isWater ? Number(((raw * CUP_ML) / 1000).toFixed(2)) : raw;
      const label =
        range === "week"
          ? cursor.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
          : range === "year"
          ? cursor.toLocaleDateString("pt-BR", { month: "2-digit", day: "2-digit" })
          : cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      days.push({
        date: label,
        full: cursor.toLocaleDateString("pt-BR"),
        valor,
        meta: target,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return { data: days, unitLabel: unit, targetValue: target };
  }, [logs, startDate, endDate, range, isWater, habit.daily_target, habit.unit]);

  const totalDays = data.length;
  const total = data.reduce((s, d) => s + d.valor, 0);
  const activeDays = data.filter((d) => d.valor > 0).length;
  const fullDays = data.filter((d) => d.valor >= targetValue && targetValue > 0).length;
  const avg = totalDays > 0 ? total / totalDays : 0;

  const fmt = (v: number) =>
    isWater ? `${v.toFixed(1)} L` : `${Number.isInteger(v) ? v : v.toFixed(1)}${unitLabel ? ` ${unitLabel}` : ""}`;

  const periodLabel: Record<Range, string> = {
    week: "Semana",
    "15d": "15 dias",
    "30d": "30 dias",
    year: "Ano",
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            {habit.name} — {periodLabel[range]}
          </CardTitle>
          <ToggleGroup
            type="single"
            size="sm"
            value={range}
            onValueChange={(v) => v && setRange(v as Range)}
            className="rounded-md border border-border bg-muted/40 p-0.5"
          >
            <ToggleGroupItem value="week" className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              Semana
            </ToggleGroupItem>
            <ToggleGroupItem value="15d" className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              15d
            </ToggleGroupItem>
            <ToggleGroupItem value="30d" className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              30d
            </ToggleGroupItem>
            <ToggleGroupItem value="year" className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              Ano
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Mini label="Total" value={fmt(total)} />
          <Mini label="Dias na meta" value={`${fullDays}/${totalDays}`} />
          <Mini label="Dias ativos" value={`${activeDays}/${totalDays}`} />
        </div>
        <div className="h-56 w-full">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-md bg-muted" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  interval={data.length > 15 ? Math.floor(data.length / 10) : 0}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(_label: unknown, p: unknown) => {
                    const arr = p as Array<{ payload?: { full?: string } }> | undefined;
                    return arr?.[0]?.payload?.full ?? "";
                  }}
                  formatter={(value: unknown) => [fmt(Number(value)), isWater ? "Consumo" : "Valor"]}
                />
                {targetValue > 0 && (
                  <ReferenceLine
                    y={targetValue}
                    stroke="var(--accent)"
                    strokeDasharray="4 4"
                    label={{ value: "Meta", position: "right", fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                )}
                <Bar dataKey="valor" name={isWater ? "Litros" : "Valor"} fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Média: <span className="font-medium text-foreground">{fmt(avg)}</span> / dia · Meta diária:{" "}
          <span className="font-medium text-foreground">{fmt(targetValue)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
