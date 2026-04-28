import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowDown, ArrowUp, Minus, Activity, Scale, Flame, Droplets, Footprints, Heart } from "lucide-react";
import { LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historico")({
  component: HistoricoPage,
});

type Period = "diario" | "semanal" | "quinzenal" | "mensal";

interface WeightRow {
  recorded_at: string;
  weight_kg: number;
  calories_burned: number | null;
  calories_consumed: number | null;
  water_liters: number | null;
}

interface ActivityRow {
  recorded_for: string;
  steps: number;
  cardio_points: number;
  energy_kcal: number;
  distance_km: number;
  active_minutes: number;
}

const PERIOD_DAYS: Record<Period, number> = {
  diario: 7,
  semanal: 28, // 4 semanas
  quinzenal: 60, // ~4 quinzenas
  mensal: 180, // 6 meses
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/** Agrupa registros em "buckets" baseado no período. */
function bucketize<T extends { date: Date }>(rows: T[], period: Period): { label: string; items: T[]; start: Date; end: Date }[] {
  if (rows.length === 0) return [];
  const buckets = new Map<string, { label: string; items: T[]; start: Date; end: Date }>();

  rows.forEach((r) => {
    let key: string;
    let label: string;
    let start: Date;
    let end: Date;
    const d = r.date;

    if (period === "diario") {
      const day = startOfDay(d);
      key = day.toISOString();
      label = fmtDay(day);
      start = day;
      end = day;
    } else if (period === "semanal") {
      // semana começa na segunda
      const day = startOfDay(d);
      const dow = (day.getDay() + 6) % 7;
      const monday = new Date(day);
      monday.setDate(day.getDate() - dow);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      key = monday.toISOString();
      label = `${fmtDay(monday)}–${fmtDay(sunday)}`;
      start = monday;
      end = sunday;
    } else if (period === "quinzenal") {
      const day = startOfDay(d);
      const isFirstHalf = day.getDate() <= 15;
      const start2 = new Date(day.getFullYear(), day.getMonth(), isFirstHalf ? 1 : 16);
      const end2 = isFirstHalf
        ? new Date(day.getFullYear(), day.getMonth(), 15)
        : new Date(day.getFullYear(), day.getMonth() + 1, 0);
      key = start2.toISOString();
      label = `${fmtDay(start2)}–${fmtDay(end2)}`;
      start = start2;
      end = end2;
    } else {
      const start2 = new Date(d.getFullYear(), d.getMonth(), 1);
      const end2 = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      key = start2.toISOString();
      label = fmtMonth(start2);
      start = start2;
      end = end2;
    }

    const existing = buckets.get(key);
    if (existing) existing.items.push(r);
    else buckets.set(key, { label, items: [r], start, end });
  });

  return Array.from(buckets.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}

function HistoricoPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("semanal");
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - PERIOD_DAYS[period] - 1);
    const sinceISO = sinceDate.toISOString().slice(0, 10);

    Promise.all([
      supabase
        .from("weight_entries")
        .select("recorded_at, weight_kg, calories_burned, calories_consumed, water_liters")
        .gte("recorded_at", sinceISO)
        .order("recorded_at", { ascending: true }),
      supabase
        .from("daily_activity")
        .select("recorded_for, steps, cardio_points, energy_kcal, distance_km, active_minutes")
        .gte("recorded_for", sinceISO)
        .order("recorded_for", { ascending: true }),
    ])
      .then(([w, a]) => {
        if (w.error) toast.error(w.error.message);
        else setWeights((w.data ?? []) as WeightRow[]);
        if (a.error) toast.error(a.error.message);
        else setActivity((a.data ?? []) as ActivityRow[]);
      })
      .finally(() => setLoading(false));
  }, [user, period]);

  // ----- Buckets -----
  const weightBuckets = useMemo(
    () =>
      bucketize(
        weights.map((w) => ({ ...w, date: new Date(w.recorded_at + "T00:00:00") })),
        period,
      ),
    [weights, period],
  );

  const activityBuckets = useMemo(
    () =>
      bucketize(
        activity.map((a) => ({ ...a, date: new Date(a.recorded_for + "T00:00:00") })),
        period,
      ),
    [activity, period],
  );

  // ----- Aggregations -----
  const weightChart = weightBuckets.map((b) => {
    const ws = b.items.map((i) => Number(i.weight_kg)).filter((n) => !isNaN(n));
    return {
      label: b.label,
      avg: ws.length ? +(ws.reduce((a, c) => a + c, 0) / ws.length).toFixed(2) : null,
      min: ws.length ? Math.min(...ws) : null,
      max: ws.length ? Math.max(...ws) : null,
      first: ws[0] ?? null,
      last: ws[ws.length - 1] ?? null,
    };
  });

  const calChart = weightBuckets.map((b) => {
    const burned = b.items.reduce((a, c) => a + (Number(c.calories_burned) || 0), 0);
    const consumed = b.items.reduce((a, c) => a + (Number(c.calories_consumed) || 0), 0);
    const water = b.items.reduce((a, c) => a + (Number(c.water_liters) || 0), 0);
    return {
      label: b.label,
      queimadas: Math.round(burned),
      consumidas: Math.round(consumed),
      agua: +water.toFixed(1),
      saldo: Math.round(consumed - burned),
    };
  });

  const actChart = activityBuckets.map((b) => {
    const sum = (k: keyof ActivityRow) => b.items.reduce((a, c) => a + (Number(c[k]) || 0), 0);
    return {
      label: b.label,
      passos: sum("steps"),
      cardio: sum("cardio_points"),
      energia: Math.round(sum("energy_kcal")),
      distancia: +sum("distance_km").toFixed(1),
      minutos: sum("active_minutes"),
    };
  });

  return (
    <div className="mx-auto w-full max-w-md pb-6 lg:max-w-[1280px]">
      <header className="px-5 pb-6 pt-8 text-primary-foreground lg:rounded-2xl lg:mx-8 lg:mt-8 lg:px-8 lg:py-8" style={{ background: "var(--gradient-hero)" }}>
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm opacity-80 hover:opacity-100 lg:hidden">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="text-2xl font-bold lg:text-3xl">Histórico</h1>
        <p className="mt-1 text-sm opacity-80">Veja sua evolução por período.</p>
      </header>

      <div className="px-4 pt-4 lg:px-8">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="diario">Diário</TabsTrigger>
            <TabsTrigger value="semanal">Semanal</TabsTrigger>
            <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
            <TabsTrigger value="mensal">Mensal</TabsTrigger>
          </TabsList>

          <TabsContent value={period} className="mt-4 space-y-4">
            {loading ? (
              <div className="space-y-3">
                <div className="h-32 animate-pulse rounded-lg bg-muted" />
                <div className="h-32 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : (
              <>
                <SummaryCards weightChart={weightChart} calChart={calChart} actChart={actChart} />

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Scale className="h-4 w-4 text-primary" /> Peso (média)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {weightChart.filter((w) => w.avg !== null).length < 2 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">Sem dados suficientes.</p>
                    ) : (
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={weightChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} domain={["dataMin - 1", "dataMax + 1"]} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Line type="monotone" dataKey="avg" name="Média (kg)" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Flame className="h-4 w-4 text-primary" /> Calorias
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {calChart.every((c) => c.queimadas === 0 && c.consumidas === 0) ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">Sem registros de calorias.</p>
                    ) : (
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={calChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="consumidas" name="Consumidas" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="queimadas" name="Queimadas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 text-primary" /> Atividade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {actChart.every((a) => a.passos === 0 && a.cardio === 0) ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">Sem registros de atividade.</p>
                    ) : (
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={actChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="passos" name="Passos" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <DetailTable
                  period={period}
                  weightChart={weightChart}
                  calChart={calChart}
                  actChart={actChart}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
};

function SummaryCards({
  weightChart,
  calChart,
  actChart,
}: {
  weightChart: { avg: number | null; min: number | null; max: number | null; first: number | null; last: number | null }[];
  calChart: { queimadas: number; consumidas: number; agua: number }[];
  actChart: { passos: number; cardio: number; minutos: number }[];
}) {
  const allWeights = weightChart.map((w) => w.avg).filter((n): n is number => n !== null);
  const totalAvg = allWeights.length ? allWeights.reduce((a, c) => a + c, 0) / allWeights.length : null;
  const firstW = weightChart.find((w) => w.first !== null)?.first ?? null;
  const lastW = [...weightChart].reverse().find((w) => w.last !== null)?.last ?? null;
  const variation = firstW != null && lastW != null ? lastW - firstW : null;

  const totalBurned = calChart.reduce((a, c) => a + c.queimadas, 0);
  const totalConsumed = calChart.reduce((a, c) => a + c.consumidas, 0);
  const totalWater = +calChart.reduce((a, c) => a + c.agua, 0).toFixed(1);
  const totalSteps = actChart.reduce((a, c) => a + c.passos, 0);
  const totalCardio = actChart.reduce((a, c) => a + c.cardio, 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Mini icon={<Scale className="h-4 w-4" />} label="Peso médio" value={totalAvg ? `${totalAvg.toFixed(1)} kg` : "—"} />
      <Mini
        icon={variation != null && variation < 0 ? <ArrowDown className="h-4 w-4" /> : variation != null && variation > 0 ? <ArrowUp className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        label="Variação"
        value={variation != null ? `${variation > 0 ? "+" : ""}${variation.toFixed(1)} kg` : "—"}
        accent={variation != null && variation < 0 ? "good" : variation != null && variation > 0 ? "bad" : "neutral"}
      />
      <Mini icon={<Flame className="h-4 w-4" />} label="Calorias gastas" value={totalBurned ? `${totalBurned.toLocaleString("pt-BR")}` : "—"} />
      <Mini icon={<Flame className="h-4 w-4" />} label="Calorias consumidas" value={totalConsumed ? `${totalConsumed.toLocaleString("pt-BR")}` : "—"} />
      <Mini icon={<Droplets className="h-4 w-4" />} label="Água" value={totalWater ? `${totalWater} L` : "—"} />
      <Mini icon={<Footprints className="h-4 w-4" />} label="Passos" value={totalSteps ? totalSteps.toLocaleString("pt-BR") : "—"} />
      <Mini icon={<Heart className="h-4 w-4" />} label="Pontos cardio" value={totalCardio ? `${totalCardio}` : "—"} />
    </div>
  );
}

function Mini({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "good" | "bad" | "neutral" }) {
  const color = accent === "good" ? "text-primary" : accent === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DetailTable({
  period,
  weightChart,
  calChart,
  actChart,
}: {
  period: Period;
  weightChart: { label: string; avg: number | null; min: number | null; max: number | null }[];
  calChart: { label: string; queimadas: number; consumidas: number; agua: number }[];
  actChart: { label: string; passos: number; cardio: number; minutos: number }[];
}) {
  const labels = Array.from(
    new Set([...weightChart.map((w) => w.label), ...calChart.map((c) => c.label), ...actChart.map((a) => a.label)]),
  );

  if (labels.length === 0) return null;

  const headerLabel = period === "diario" ? "Dia" : period === "semanal" ? "Semana" : period === "quinzenal" ? "Quinzena" : "Mês";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Detalhamento</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pb-3">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{headerLabel}</th>
              <th className="px-3 py-2 text-right">Peso</th>
              <th className="px-3 py-2 text-right">Cal±</th>
              <th className="px-3 py-2 text-right">Passos</th>
            </tr>
          </thead>
          <tbody>
            {[...labels].reverse().map((label) => {
              const w = weightChart.find((x) => x.label === label);
              const c = calChart.find((x) => x.label === label);
              const a = actChart.find((x) => x.label === label);
              const balance = c ? c.consumidas - c.queimadas : 0;
              return (
                <tr key={label} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-3 py-2 text-right">{w?.avg ? `${w.avg.toFixed(1)} kg` : "—"}</td>
                  <td className={`px-3 py-2 text-right ${balance < 0 ? "text-primary" : balance > 0 ? "text-destructive" : ""}`}>
                    {c && (c.queimadas || c.consumidas) ? `${balance > 0 ? "+" : ""}${balance}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{a?.passos ? a.passos.toLocaleString("pt-BR") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
