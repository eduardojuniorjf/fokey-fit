import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, Scale, ListChecks, Target, TrendingDown, TrendingUp, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

interface WeightRow {
  recorded_at: string;
  weight_kg: number;
  calories_burned: number | null;
  calories_consumed: number | null;
  water_liters: number | null;
}
interface Goal {
  start_weight_kg: number;
  height_cm: number;
  target_weight_kg: number;
  target_date: string;
  start_date: string;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function DashboardPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("weight_entries")
        .select("recorded_at, weight_kg, calories_burned, calories_consumed, water_liters")
        .order("recorded_at", { ascending: true })
        .limit(180),
      supabase.from("weight_goals").select("*").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ])
      .then(([profileRes, weightRes, goalRes]) => {
        if (profileRes.data) setDisplayName(profileRes.data.display_name);
        if (weightRes.error) toast.error(weightRes.error.message);
        else setWeights((weightRes.data ?? []) as WeightRow[]);
        if (!goalRes.error) setGoal((goalRes.data as Goal | null) ?? null);
      })
      .finally(() => setLoading(false));
  }, [user]);

  // ------ Meta progress ------
  const currentWeight = weights.length ? Number(weights[weights.length - 1].weight_kg) : null;
  const totalToLose = goal ? goal.start_weight_kg - goal.target_weight_kg : 0;
  const lostSoFar = goal && currentWeight !== null ? goal.start_weight_kg - currentWeight : 0;
  const progressPct = totalToLose > 0 ? Math.max(0, Math.min(100, (lostSoFar / totalToLose) * 100)) : 0;
  const daysLeft = goal
    ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // ------ Painel do mês atual ------
  const now = new Date();
  const monthWeights = weights.filter((w) => {
    const d = new Date(w.recorded_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const ws = monthWeights.map((w) => Number(w.weight_kg)).filter((n) => !isNaN(n));
  const monthMax = ws.length ? Math.max(...ws) : null;
  const monthMin = ws.length ? Math.min(...ws) : null;
  const monthAvg = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
  const monthFirst = ws[0] ?? null;
  const monthLast = ws[ws.length - 1] ?? null;
  const monthLossPct =
    monthFirst && monthLast ? ((monthFirst - monthLast) / monthFirst) * 100 : null;

  // ------ Charts ------
  const weightChartData = weights.map((w) => ({
    date: new Date(w.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    peso: Number(w.weight_kg),
  }));

  const last30 = weights.slice(-30);
  const calChartData = last30.map((w) => ({
    date: new Date(w.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    queimadas: Number(w.calories_burned) || 0,
    consumidas: Number(w.calories_consumed) || 0,
  }));

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Hero header */}
      <header className="px-5 pb-8 pt-10 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <p className="text-sm opacity-80">{greeting()},</p>
        <h1 className="mt-1 text-2xl font-bold">
          {displayName ?? user?.email?.split("@")[0] ?? "atleta"} 💪
        </h1>
        <p className="mt-2 text-sm opacity-75">Vamos para mais um dia de progresso.</p>
      </header>

      <div className="-mt-6 space-y-5 px-4 pb-6">
        {/* Card de meta */}
        {goal ? (
          <Link to="/medidas">
            <Card className="overflow-hidden border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Meta de peso</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{daysLeft}d restantes</span>
                </div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-3xl font-bold text-primary">{progressPct.toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">
                    {currentWeight?.toFixed(1) ?? "—"} → {Number(goal.target_weight_kg).toFixed(1)} kg
                  </p>
                </div>
                <Progress value={progressPct} />
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Link to="/medidas">
            <Card className="border-dashed border-2">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Defina sua meta</p>
                  <p className="text-xs text-muted-foreground">Acompanhe seu progresso</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Painel do mês atual */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Painel de {MONTHS[now.getMonth()]} / {now.getFullYear()}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pb-5">
            <Stat icon={<ArrowUp className="h-4 w-4" />} label="Máximo" value={monthMax ? `${monthMax.toFixed(1)} kg` : "—"} />
            <Stat icon={<ArrowDown className="h-4 w-4" />} label="Mínimo" value={monthMin ? `${monthMin.toFixed(1)} kg` : "—"} />
            <Stat icon={<Minus className="h-4 w-4" />} label="Média" value={monthAvg ? `${monthAvg.toFixed(1)} kg` : "—"} />
            <Stat
              icon={monthLossPct != null && monthLossPct >= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              label="% do mês"
              value={monthLossPct != null ? `${monthLossPct >= 0 ? "-" : "+"}${Math.abs(monthLossPct).toFixed(1)}%` : "—"}
              accent={monthLossPct != null && monthLossPct > 0 ? "good" : monthLossPct != null && monthLossPct < 0 ? "bad" : "neutral"}
            />
          </CardContent>
        </Card>

        {/* Atalhos */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registrar agora</h2>
          <div className="grid grid-cols-3 gap-3">
            <QuickAction to="/medidas" icon={<Scale className="h-5 w-5" />} label="Peso" />
            <QuickAction to="/atividade" icon={<Activity className="h-5 w-5" />} label="Atividade" />
            <QuickAction to="/habitos" icon={<ListChecks className="h-5 w-5" />} label="Hábitos" />
          </div>
        </div>

        {/* Gráfico de peso */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução do peso</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 animate-pulse rounded-md bg-muted" />
            ) : weightChartData.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Registre seu peso ao menos 2 vezes para ver a evolução.
              </p>
            ) : (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                    <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={2.5} dot={{ fill: "var(--primary)", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de calorias */}
        {calChartData.some((d) => d.queimadas > 0 || d.consumidas > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Calorias (últimos 30 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={calChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cQ" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="queimadas" stroke="var(--primary)" fill="url(#cQ)" strokeWidth={2} />
                    <Area type="monotone" dataKey="consumidas" stroke="var(--accent)" fill="url(#cC)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex justify-center gap-4 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Queimadas</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />Consumidas</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "good" | "bad" | "neutral" }) {
  const color = accent === "good" ? "text-primary" : accent === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: "/atividade" | "/medidas" | "/habitos"; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-all hover:border-primary hover:shadow-md"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
        {icon}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
