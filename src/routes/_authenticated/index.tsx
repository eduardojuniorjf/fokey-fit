import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Activity, Scale, ListChecks, Target, TrendingDown, TrendingUp,
  ArrowDown, ArrowUp, Minus, Flame, Footprints, Heart, Sparkles, Award, History,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, BarChart, Bar,
} from "recharts";
import { toast } from "sonner";
import { MasonryDashboard } from "@/components/MasonryDashboard";

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
interface DailyActivity {
  recorded_for: string;
  steps: number;
  cardio_points: number;
  energy_kcal: number;
  active_minutes: number;
}
interface ActivityGoals {
  daily_steps: number;
  daily_cardio_points: number;
}
interface Habit {
  id: string;
  name: string;
  daily_target: number;
  unit: string | null;
}
interface HabitLog {
  habit_id: string;
  value: number;
}

const DEFAULT_ACT_GOALS: ActivityGoals = { daily_steps: 8000, daily_cardio_points: 7 };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const todayISO = () => new Date().toISOString().slice(0, 10);

function bmiCategory(bmi: number) {
  if (bmi < 18.5) return { label: "Abaixo", tone: "text-blue-500" };
  if (bmi < 25) return { label: "Normal", tone: "text-emerald-500" };
  if (bmi < 30) return { label: "Sobrepeso", tone: "text-amber-500" };
  if (bmi < 35) return { label: "Obesidade I", tone: "text-orange-500" };
  if (bmi < 40) return { label: "Obesidade II", tone: "text-red-500" };
  return { label: "Obesidade III", tone: "text-red-700" };
}

function DashboardPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [actGoals, setActGoals] = useState<ActivityGoals>(DEFAULT_ACT_GOALS);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const today = todayISO();
    Promise.all([
      supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("weight_entries")
        .select("recorded_at, weight_kg, calories_burned, calories_consumed, water_liters")
        .order("recorded_at", { ascending: true })
        .limit(180),
      supabase.from("weight_goals").select("*").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase
        .from("daily_activity")
        .select("recorded_for, steps, cardio_points, energy_kcal, active_minutes")
        .order("recorded_for", { ascending: true })
        .limit(60),
      supabase.from("activity_goals").select("daily_steps, daily_cardio_points").maybeSingle(),
      supabase.from("habits").select("id, name, daily_target, unit").eq("active", true).order("created_at", { ascending: true }),
      supabase.from("habit_logs").select("habit_id, value").eq("logged_for", today),
    ])
      .then(([profileRes, weightRes, goalRes, actRes, actGoalsRes, habitsRes, logsRes]) => {
        if (profileRes.data) setDisplayName(profileRes.data.display_name);
        if (weightRes.error) toast.error(weightRes.error.message);
        else setWeights((weightRes.data ?? []) as WeightRow[]);
        if (!goalRes.error) setGoal((goalRes.data as Goal | null) ?? null);
        if (!actRes.error) setActivity((actRes.data ?? []) as DailyActivity[]);
        if (!actGoalsRes.error && actGoalsRes.data) setActGoals(actGoalsRes.data as ActivityGoals);
        if (!habitsRes.error) setHabits((habitsRes.data ?? []) as Habit[]);
        if (!logsRes.error) setHabitLogs((logsRes.data ?? []) as HabitLog[]);
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

  // ------ IMC ------
  const bmi = useMemo(() => {
    if (!goal?.height_cm || currentWeight == null) return null;
    const h = goal.height_cm / 100;
    return currentWeight / (h * h);
  }, [goal?.height_cm, currentWeight]);
  const bmiCat = bmi != null ? bmiCategory(bmi) : null;

  // ------ Mês ------
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
  const monthLossPct = monthFirst && monthLast ? ((monthFirst - monthLast) / monthFirst) * 100 : null;

  // ------ Hoje (atividade) ------
  const today = todayISO();
  const todayAct = activity.find((a) => a.recorded_for === today);
  const stepsPct = Math.min(100, ((todayAct?.steps ?? 0) / actGoals.daily_steps) * 100);
  const cardioPct = Math.min(100, ((todayAct?.cardio_points ?? 0) / actGoals.daily_cardio_points) * 100);

  // ------ Streak (dias com atividade OU peso registrado) ------
  const streak = useMemo(() => {
    const dates = new Set<string>();
    activity.forEach((a) => dates.add(a.recorded_for));
    weights.forEach((w) => dates.add(w.recorded_at.slice(0, 10)));
    let count = 0;
    const d = new Date();
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if (dates.has(iso)) {
        count++;
        d.setDate(d.getDate() - 1);
      } else if (count === 0 && iso === today) {
        // permite quebra hoje sem zerar
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return count;
  }, [activity, weights, today]);

  // ------ Hábitos hoje ------
  const habitProgress = habits.map((h) => {
    const total = habitLogs.filter((l) => l.habit_id === h.id).reduce((s, l) => s + Number(l.value || 0), 0);
    return { habit: h, total, pct: Math.min(100, (total / h.daily_target) * 100) };
  });
  const habitsCompleted = habitProgress.filter((h) => h.pct >= 100).length;

  // ------ Insight dinâmico ------
  const insight = useMemo(() => {
    if (todayAct && todayAct.steps < actGoals.daily_steps) {
      const left = actGoals.daily_steps - todayAct.steps;
      return `Faltam ${left.toLocaleString("pt-BR")} passos para sua meta diária.`;
    }
    if (!todayAct) return "Você ainda não registrou atividade hoje. Que tal começar?";
    if (habits.length && habitsCompleted < habits.length) {
      return `${habits.length - habitsCompleted} hábito(s) ainda esperam por você hoje.`;
    }
    if (goal && progressPct >= 100) return "Meta de peso atingida! Hora de definir o próximo desafio. 🎉";
    return "Você está em ritmo. Mantenha a consistência! 🔥";
  }, [todayAct, actGoals, habits.length, habitsCompleted, goal, progressPct]);

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
  const last7Activity = useMemo(() => {
    const out: { date: string; passos: number; cardio: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const row = activity.find((a) => a.recorded_for === iso);
      out.push({
        date: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        passos: row?.steps ?? 0,
        cardio: row?.cardio_points ?? 0,
      });
    }
    return out;
  }, [activity]);

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-[1280px] lg:px-8 lg:py-8">
      {/* Hero — full bleed mobile, contido desktop */}
      <header
        className="px-5 pb-8 pt-10 text-primary-foreground lg:rounded-2xl lg:px-8 lg:py-8"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-8">
          <div>
            <p className="text-sm opacity-80">{greeting()},</p>
            <h1 className="mt-1 text-2xl font-bold lg:text-3xl">
              {displayName ?? user?.email?.split("@")[0] ?? "atleta"} 💪
            </h1>
            <p className="mt-2 text-sm opacity-75">Vamos para mais um dia de progresso.</p>
          </div>
          {/* Streak destaque desktop */}
          <div className="mt-4 hidden items-center gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur lg:flex">
            <Flame className="h-6 w-6 text-orange-300" />
            <div>
              <p className="text-2xl font-bold">{streak}</p>
              <p className="text-xs opacity-80">dias de sequência</p>
            </div>
          </div>
        </div>
      </header>

      {/* ===== MOBILE LAYOUT (mantido) ===== */}
      <div className="-mt-6 space-y-5 px-4 pb-6 lg:hidden">
        <GoalCard goal={goal} progressPct={progressPct} currentWeight={currentWeight} daysLeft={daysLeft} />
        <MonthPanel
          monthMax={monthMax} monthMin={monthMin} monthAvg={monthAvg} monthLossPct={monthLossPct} now={now}
        />
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registrar agora</h2>
          <div className="grid grid-cols-4 gap-3">
            <QuickAction to="/medidas" icon={<Scale className="h-5 w-5" />} label="Peso" />
            <QuickAction to="/atividade" icon={<Activity className="h-5 w-5" />} label="Atividade" />
            <QuickAction to="/habitos" icon={<ListChecks className="h-5 w-5" />} label="Hábitos" />
            <QuickAction to="/historico" icon={<History className="h-5 w-5" />} label="Histórico" />
          </div>
        </div>
        <WeightChart loading={loading} data={weightChartData} />
        {calChartData.some((d) => d.queimadas > 0 || d.consumidas > 0) && <CalChart data={calChartData} />}
      </div>

      {/* ===== DESKTOP MASONRY + DRAG-AND-DROP ===== */}
      <div className="hidden lg:mt-6 lg:block">
        <MasonryDashboard
          widgets={[
            { id: "kpi-steps", node: (
              <KpiCard icon={<Footprints className="h-5 w-5" />} label="Passos hoje"
                value={(todayAct?.steps ?? 0).toLocaleString("pt-BR")}
                sub={`Meta ${actGoals.daily_steps.toLocaleString("pt-BR")}`} progress={stepsPct} />
            )},
            { id: "kpi-cardio", node: (
              <KpiCard icon={<Heart className="h-5 w-5" />} label="Pontos cardio"
                value={String(todayAct?.cardio_points ?? 0)}
                sub={`Meta ${actGoals.daily_cardio_points}`} progress={cardioPct} />
            )},
            { id: "kpi-energy", node: (
              <KpiCard icon={<Flame className="h-5 w-5" />} label="Energia hoje"
                value={`${todayAct?.energy_kcal ?? 0} kcal`}
                sub={`${todayAct?.active_minutes ?? 0} min ativos`} />
            )},
            { id: "kpi-weight", node: (
              <KpiCard icon={<Scale className="h-5 w-5" />} label="Peso atual"
                value={currentWeight != null ? `${currentWeight.toFixed(1)} kg` : "—"}
                sub={bmi != null && bmiCat ? `IMC ${bmi.toFixed(1)} · ${bmiCat.label}` : "Defina altura na meta"}
                accent={bmiCat?.tone} />
            )},
            { id: "goal", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-primary" /> Meta de peso
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {goal ? (
                    <>
                      <div className="mb-3 flex items-baseline justify-between">
                        <p className="text-4xl font-bold text-primary">{progressPct.toFixed(0)}%</p>
                        <div className="text-right text-sm text-muted-foreground">
                          <p>{currentWeight?.toFixed(1) ?? "—"} → {Number(goal.target_weight_kg).toFixed(1)} kg</p>
                          <p className="text-xs">{daysLeft} dias restantes</p>
                        </div>
                      </div>
                      <Progress value={progressPct} className="h-3" />
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <MiniStat label="Início" value={`${Number(goal.start_weight_kg).toFixed(1)} kg`} />
                        <MiniStat label="Perdido" value={`${Math.max(0, lostSoFar).toFixed(1)} kg`} accent="good" />
                        <MiniStat label="Faltam" value={`${Math.max(0, totalToLose - lostSoFar).toFixed(1)} kg`} />
                      </div>
                    </>
                  ) : (
                    <Link to="/medidas" className="block rounded-lg border-2 border-dashed border-border p-6 text-center hover:border-primary">
                      <Target className="mx-auto h-8 w-8 text-primary" />
                      <p className="mt-2 text-sm font-semibold">Defina sua meta de peso</p>
                      <p className="text-xs text-muted-foreground">Acompanhe seu progresso</p>
                    </Link>
                  )}
                </CardContent>
              </Card>
            )},
            { id: "insight", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" /> Insight do dia
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-relaxed">{insight}</p>
                  <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2">
                    <Award className="h-4 w-4 text-primary" />
                    <p className="text-xs">
                      <span className="font-semibold text-primary">{streak}</span>{" "}
                      {streak === 1 ? "dia ativo" : "dias ativos"} seguidos
                    </p>
                  </div>
                </CardContent>
              </Card>
            )},
            { id: "habits", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListChecks className="h-4 w-4 text-primary" /> Hábitos hoje
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{habitsCompleted}/{habits.length}</span>
                </CardHeader>
                <CardContent>
                  {habits.length === 0 ? (
                    <Link to="/habitos" className="block rounded-lg border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground hover:border-primary">
                      Crie seus primeiros hábitos
                    </Link>
                  ) : (
                    <ul className="space-y-2.5 max-h-[240px] overflow-y-auto">
                      {habitProgress.map(({ habit, total, pct }) => (
                        <li key={habit.id}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium truncate">{habit.name}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {total}/{habit.daily_target}{habit.unit ? ` ${habit.unit}` : ""}
                            </span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )},
            { id: "weight-chart", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Evolução do peso</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-64 animate-pulse rounded-md bg-muted" />
                  ) : weightChartData.length < 2 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Registre seu peso ao menos 2 vezes para ver a evolução.
                    </p>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weightChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
            )},
            { id: "month", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {MONTHS[now.getMonth()]} / {now.getFullYear()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <Stat icon={<ArrowUp className="h-4 w-4" />} label="Máximo" value={monthMax ? `${monthMax.toFixed(1)} kg` : "—"} />
                  <Stat icon={<ArrowDown className="h-4 w-4" />} label="Mínimo" value={monthMin ? `${monthMin.toFixed(1)} kg` : "—"} />
                  <Stat icon={<Minus className="h-4 w-4" />} label="Média" value={monthAvg ? `${monthAvg.toFixed(1)} kg` : "—"} />
                  <Stat
                    icon={monthLossPct != null && monthLossPct >= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                    label="% mês"
                    value={monthLossPct != null ? `${monthLossPct >= 0 ? "-" : "+"}${Math.abs(monthLossPct).toFixed(1)}%` : "—"}
                    accent={monthLossPct != null && monthLossPct > 0 ? "good" : monthLossPct != null && monthLossPct < 0 ? "bad" : "neutral"}
                  />
                </CardContent>
              </Card>
            )},
            { id: "activity-7d", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Atividade — últimos 7 dias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={last7Activity} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                        <Bar dataKey="passos" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )},
            { id: "calories", node: (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Calorias — últimos 30 dias</CardTitle>
                </CardHeader>
                <CardContent>
                  {calChartData.some((d) => d.queimadas > 0 || d.consumidas > 0) ? (
                    <>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={calChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                            <defs>
                              <linearGradient id="cQd" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="cCd" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.6} />
                                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                            <Area type="monotone" dataKey="queimadas" stroke="var(--primary)" fill="url(#cQd)" strokeWidth={2} />
                            <Area type="monotone" dataKey="consumidas" stroke="var(--accent)" fill="url(#cCd)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 flex justify-center gap-4 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Queimadas</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />Consumidas</span>
                      </div>
                    </>
                  ) : (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Sem dados de calorias nos últimos 30 dias.
                    </p>
                  )}
                </CardContent>
              </Card>
            )},
          ]}
        />
      </div>
    </div>
  );
}

/* ----------- Componentes auxiliares ----------- */

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

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: "good" }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${accent === "good" ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, progress, accent, className,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  progress?: number; accent?: string; className?: string;
}) {
  return (
    <Card className={`border-0 shadow-md ${className ?? ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
        {sub && <p className={`mt-0.5 text-xs ${accent ?? "text-muted-foreground"}`}>{sub}</p>}
        {progress != null && <Progress value={progress} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, icon, label }: { to: "/atividade" | "/medidas" | "/habitos" | "/historico"; icon: React.ReactNode; label: string }) {
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

function GoalCard({ goal, progressPct, currentWeight, daysLeft }: {
  goal: Goal | null; progressPct: number; currentWeight: number | null; daysLeft: number;
}) {
  if (!goal) {
    return (
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
    );
  }
  return (
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
  );
}

function MonthPanel({ monthMax, monthMin, monthAvg, monthLossPct, now }: {
  monthMax: number | null; monthMin: number | null; monthAvg: number | null; monthLossPct: number | null; now: Date;
}) {
  return (
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
  );
}

function WeightChart({ loading, data }: { loading: boolean; data: { date: string; peso: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolução do peso</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-40 animate-pulse rounded-md bg-muted" />
        ) : data.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Registre seu peso ao menos 2 vezes para ver a evolução.
          </p>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
  );
}

function CalChart({ data }: { data: { date: string; queimadas: number; consumidas: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Calorias (últimos 30 dias)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
  );
}
