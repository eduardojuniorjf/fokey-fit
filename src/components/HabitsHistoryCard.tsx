import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Range = "week" | "15d" | "30d" | "year";

interface HabitRow {
  id: string;
  daily_target: number;
  icon: string;
}

interface LogRow {
  habit_id: string;
  logged_for: string; // YYYY-MM-DD
  value: number;
}

const WATER_ICON = "water";

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function HabitsHistoryCard({ userId }: { userId: string | undefined }) {
  const [range, setRange] = useState<Range>("week");
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Date range bounds
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
      const [h, l] = await Promise.all([
        supabase.from("habits").select("id,daily_target,icon").eq("active", true),
        supabase
          .from("habit_logs")
          .select("habit_id,logged_for,value")
          .gte("logged_for", isoDate(startDate))
          .lte("logged_for", isoDate(endDate)),
      ]);
      if (cancelled) return;
      setHabits(((h.data ?? []) as HabitRow[]));
      setLogs(((l.data ?? []) as LogRow[]));
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [userId, startDate, endDate]);

  // Build day-by-day data: percentage of habits completed
  const data = useMemo(() => {
    const habitMap = new Map(habits.map((h) => [h.id, h]));
    // group logs by date
    const byDate = new Map<string, LogRow[]>();
    for (const lg of logs) {
      const arr = byDate.get(lg.logged_for) ?? [];
      arr.push(lg);
      byDate.set(lg.logged_for, arr);
    }

    const totalHabits = habits.length;
    const days: { date: string; full: string; pct: number; done: number; total: number }[] = [];

    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const iso = isoDate(cursor);
      const dayLogs = byDate.get(iso) ?? [];
      let done = 0;
      // count completion per habit
      const perHabit = new Map<string, number>();
      for (const lg of dayLogs) {
        perHabit.set(lg.habit_id, (perHabit.get(lg.habit_id) ?? 0) + Number(lg.value));
      }
      for (const [hid, val] of perHabit) {
        const h = habitMap.get(hid);
        if (!h) continue;
        if (h.icon === WATER_ICON) {
          if (val >= Number(h.daily_target)) done += 1;
        } else {
          done += 1;
        }
      }
      const pct = totalHabits > 0 ? Math.round((done / totalHabits) * 100) : 0;
      const label =
        range === "week"
          ? cursor.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
          : range === "year"
          ? cursor.toLocaleDateString("pt-BR", { month: "2-digit", day: "2-digit" })
          : cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      days.push({
        date: label,
        full: cursor.toLocaleDateString("pt-BR"),
        pct,
        done,
        total: totalHabits,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [habits, logs, startDate, endDate, range]);

  const totalDays = data.length;
  const fullDays = data.filter((d) => d.total > 0 && d.done === d.total).length;
  const avgPct = totalDays > 0 ? Math.round(data.reduce((s, d) => s + d.pct, 0) / totalDays) : 0;
  const activeDays = data.filter((d) => d.done > 0).length;

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
            Histórico de hábitos — {periodLabel[range]}
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
          <Mini label="Conclusão média" value={`${avgPct}%`} />
          <Mini label="Dias 100%" value={`${fullDays}/${totalDays}`} />
          <Mini label="Dias ativos" value={`${activeDays}/${totalDays}`} />
        </div>
        <div className="h-56 w-full">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-md bg-muted" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="habitsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  interval={data.length > 15 ? Math.floor(data.length / 10) : 0}
                />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
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
                  formatter={(value: unknown, _name: unknown, props: unknown) => {
                    const item = props as { payload?: { done: number; total: number } } | undefined;
                    const p = item?.payload;
                    return [`${value}% (${p?.done ?? 0}/${p?.total ?? 0})`, "Conclusão"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#habitsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Média: <span className="font-medium text-foreground">{avgPct}%</span> de conclusão por dia
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
