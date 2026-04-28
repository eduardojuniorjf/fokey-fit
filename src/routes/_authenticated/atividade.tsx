import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Activity, Footprints, Heart, Flame, MapPin, Timer,
  Trash2, Bike, Waves, Dumbbell, Target, Settings,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atividade")({
  component: AtividadePage,
});

interface DailyRow {
  id: string;
  recorded_for: string;
  steps: number;
  cardio_points: number;
  energy_kcal: number;
  distance_km: number;
  active_minutes: number;
  source: string;
  notes: string | null;
}
interface Goals {
  id?: string;
  daily_steps: number;
  daily_cardio_points: number;
  daily_energy_kcal: number;
  daily_active_minutes: number;
  weekly_cardio_points: number;
  weekly_steps: number;
}
interface CardioRow {
  id: string;
  activity_type: string;
  performed_at: string;
  duration_minutes: number;
  distance_km: number | null;
  calories: number | null;
  notes: string | null;
}

const DEFAULT_GOALS: Goals = {
  daily_steps: 8000,
  daily_cardio_points: 7,
  daily_energy_kcal: 500,
  daily_active_minutes: 30,
  weekly_cardio_points: 150,
  weekly_steps: 56000,
};

const ACTIVITY_TYPES = [
  { value: "running", label: "Corrida", icon: Footprints },
  { value: "walking", label: "Caminhada", icon: Footprints },
  { value: "cycling", label: "Ciclismo", icon: Bike },
  { value: "swimming", label: "Natação", icon: Waves },
  { value: "other", label: "Outro", icon: Dumbbell },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // semana inicia segunda
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function AtividadePage() {
  const { user } = useAuth();
  const [days, setDays] = useState<DailyRow[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [cardio, setCardio] = useState<CardioRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [openDay, setOpenDay] = useState(false);
  const [openGoals, setOpenGoals] = useState(false);
  const [openCardio, setOpenCardio] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Daily form
  const [dDate, setDDate] = useState(todayISO());
  const [dSteps, setDSteps] = useState("");
  const [dCardioPts, setDCardioPts] = useState("");
  const [dEnergy, setDEnergy] = useState("");
  const [dDistance, setDDistance] = useState("");
  const [dActiveMin, setDActiveMin] = useState("");

  // Goals form (controlled)
  const [gForm, setGForm] = useState<Goals>(DEFAULT_GOALS);

  // Cardio form
  const [cType, setCType] = useState("running");
  const [cDur, setCDur] = useState("");
  const [cDist, setCDist] = useState("");
  const [cCal, setCCal] = useState("");
  const [cNotes, setCNotes] = useState("");

  const load = () => {
    if (!user) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 29);
    const sinceISO = since.toISOString().slice(0, 10);
    Promise.all([
      supabase
        .from("daily_activity")
        .select("*")
        .gte("recorded_for", sinceISO)
        .order("recorded_for", { ascending: false }),
      supabase.from("activity_goals").select("*").maybeSingle(),
      supabase
        .from("cardio_activities")
        .select("*")
        .order("performed_at", { ascending: false })
        .limit(20),
    ]).then(([d, g, c]) => {
      if (d.error) toast.error(d.error.message); else setDays((d.data ?? []) as DailyRow[]);
      if (g.data) setGoals({ ...DEFAULT_GOALS, ...(g.data as Goals) });
      if (c.error) toast.error(c.error.message); else setCardio((c.data ?? []) as CardioRow[]);
      setLoading(false);
    });
  };
  useEffect(load, [user]);

  // pré-preenche o form de "registrar dia" com o registro do dia escolhido
  useEffect(() => {
    if (!openDay) return;
    const existing = days.find((d) => d.recorded_for === dDate);
    setDSteps(existing ? String(existing.steps) : "");
    setDCardioPts(existing ? String(existing.cardio_points) : "");
    setDEnergy(existing ? String(existing.energy_kcal) : "");
    setDDistance(existing ? String(existing.distance_km) : "");
    setDActiveMin(existing ? String(existing.active_minutes) : "");
  }, [openDay, dDate, days]);

  useEffect(() => {
    if (openGoals) setGForm(goals);
  }, [openGoals, goals]);

  // ===== Cálculos =====
  const today = useMemo(() => days.find((d) => d.recorded_for === todayISO()), [days]);
  const weekStart = startOfWeekISO();
  const weekDays = useMemo(() => days.filter((d) => d.recorded_for >= weekStart), [days, weekStart]);
  const weekSum = useMemo(
    () => ({
      steps: weekDays.reduce((s, d) => s + d.steps, 0),
      cardio: weekDays.reduce((s, d) => s + d.cardio_points, 0),
      energy: weekDays.reduce((s, d) => s + Number(d.energy_kcal), 0),
      minutes: weekDays.reduce((s, d) => s + d.active_minutes, 0),
      distance: weekDays.reduce((s, d) => s + Number(d.distance_km), 0),
    }),
    [weekDays],
  );

  // série dos últimos 7 dias com label PT-BR
  const last7 = useMemo(() => {
    const out: { dayLabel: string; iso: string; steps: number; cardio: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const r = days.find((x) => x.recorded_for === iso);
      const dayLabel = ["D", "S", "T", "Q", "Q", "S", "S"][d.getDay()];
      out.push({ dayLabel, iso, steps: r?.steps ?? 0, cardio: r?.cardio_points ?? 0 });
    }
    return out;
  }, [days]);

  // Anel: % de pontos cardio da meta diária e % passos
  const ringCardioPct = goals.daily_cardio_points
    ? Math.min(100, ((today?.cardio_points ?? 0) / goals.daily_cardio_points) * 100)
    : 0;
  const ringStepsPct = goals.daily_steps
    ? Math.min(100, ((today?.steps ?? 0) / goals.daily_steps) * 100)
    : 0;

  // ===== Mutations =====
  const submitDay = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const payload = {
      user_id: user.id,
      recorded_for: dDate,
      steps: dSteps ? Number(dSteps) : 0,
      cardio_points: dCardioPts ? Number(dCardioPts) : 0,
      energy_kcal: dEnergy ? Number(dEnergy) : 0,
      distance_km: dDistance ? Number(dDistance) : 0,
      active_minutes: dActiveMin ? Number(dActiveMin) : 0,
      source: "manual",
    };
    const { error } = await supabase
      .from("daily_activity")
      .upsert(payload, { onConflict: "user_id,recorded_for" });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Atividade do dia salva!");
    setOpenDay(false); load();
  };

  const submitGoals = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const payload = { ...gForm, user_id: user.id };
    const { error } = await supabase
      .from("activity_goals")
      .upsert(payload, { onConflict: "user_id" });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Metas atualizadas!");
    setOpenGoals(false); load();
  };

  const submitCardio = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("cardio_activities").insert({
      user_id: user.id,
      activity_type: cType,
      duration_minutes: Number(cDur),
      distance_km: cDist ? Number(cDist) : null,
      calories: cCal ? Number(cCal) : null,
      notes: cNotes || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Cardio registrado!");
    setOpenCardio(false);
    setCDur(""); setCDist(""); setCCal(""); setCNotes("");
    load();
  };

  const deleteCardio = async (id: string) => {
    const { error } = await supabase.from("cardio_activities").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removido."); load(); }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-2 lg:max-w-[1280px] lg:px-8 lg:pt-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Atividade</h1>
          <p className="text-sm text-muted-foreground">Passos, cardio e energia</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpenGoals(true)}>
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      <Tabs defaultValue="hoje">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="cardio">Cardio</TabsTrigger>
        </TabsList>

        {/* HOJE */}
        <TabsContent value="hoje" className="mt-4 space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {/* Anel central */}
          <Card className="border-0 shadow-md">
            <CardContent className="flex flex-col items-center py-6">
              <DualRing cardioPct={ringCardioPct} stepsPct={ringStepsPct}>
                <p className="text-3xl font-bold leading-none text-primary">
                  {today?.cardio_points ?? 0}
                </p>
                <p className="mt-1 text-base font-semibold text-blue-500">
                  {(today?.steps ?? 0).toLocaleString("pt-BR")}
                </p>
              </DualRing>
              <div className="mt-4 flex gap-6 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-primary" /> Pontos cardio
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Footprints className="h-3.5 w-3.5 text-blue-500" /> Passos
                </span>
              </div>

              <div className="mt-5 grid w-full grid-cols-3 gap-3 text-center">
                <Stat icon={<Flame className="h-4 w-4" />} label="Cal" value={Math.round(Number(today?.energy_kcal ?? 0)).toString()} />
                <Stat icon={<MapPin className="h-4 w-4" />} label="km" value={Number(today?.distance_km ?? 0).toFixed(2)} />
                <Stat icon={<Timer className="h-4 w-4" />} label="Min" value={(today?.active_minutes ?? 0).toString()} />
              </div>

              <Button className="mt-5 w-full" onClick={() => { setDDate(todayISO()); setOpenDay(true); }}>
                <Plus className="mr-1 h-4 w-4" /> {today ? "Atualizar registro" : "Registrar dia"}
              </Button>
            </CardContent>
          </Card>

          {/* Histórico recente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Últimos dias</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="h-32 animate-pulse rounded-md bg-muted" />
              ) : days.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum dia registrado ainda.
                </p>
              ) : (
                <ul className="divide-y">
                  {days.slice(0, 7).map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => { setDDate(d.recorded_for); setOpenDay(true); }}
                        className="flex w-full items-center justify-between py-2.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {new Date(d.recorded_for + "T00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {d.steps.toLocaleString("pt-BR")} passos · {d.cardio_points} pts · {Math.round(Number(d.energy_kcal))} cal
                          </p>
                        </div>
                        <span className="text-xs text-primary">editar</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEMANA */}
        <TabsContent value="semana" className="mt-4 space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Meta semanal de pontos cardio
                <span className="text-sm font-normal text-muted-foreground">
                  {weekSum.cardio} de {goals.weekly_cardio_points}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={weekSum.cardio} max={goals.weekly_cardio_points} color="primary" />
              <p className="mt-2 text-xs text-muted-foreground">
                A OMS recomenda 150 pontos cardio por semana para uma vida mais saudável.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Meta semanal de passos
                <span className="text-sm font-normal text-muted-foreground">
                  {weekSum.steps.toLocaleString("pt-BR")} / {goals.weekly_steps.toLocaleString("pt-BR")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={weekSum.steps} max={goals.weekly_steps} color="blue" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pontos cardio - 7 dias</CardTitle></CardHeader>
            <CardContent>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last7} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="cardio" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Passos - 7 dias</CardTitle></CardHeader>
            <CardContent>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last7} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="steps" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <SummaryCard label="Energia" value={`${Math.round(weekSum.energy)} cal`} />
            <SummaryCard label="Distância" value={`${weekSum.distance.toFixed(1)} km`} />
            <SummaryCard label="Min. ativos" value={`${weekSum.minutes}`} />
            <SummaryCard label="Dias ativos" value={`${weekDays.length}/7`} />
          </div>
        </TabsContent>

        {/* CARDIO */}
        <TabsContent value="cardio" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Sheet open={openCardio} onOpenChange={setOpenCardio}>
              <SheetTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Nova sessão</Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader><SheetTitle>Nova sessão de cardio</SheetTitle></SheetHeader>
                <form onSubmit={submitCardio} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={cType} onValueChange={setCType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumField id="dur" label="Minutos *" value={cDur} onChange={setCDur} required />
                    <NumField id="dist" label="Distância (km)" value={cDist} onChange={setCDist} />
                  </div>
                  <NumField id="cal" label="Calorias" value={cCal} onChange={setCCal} />
                  <div className="space-y-1.5">
                    <Label htmlFor="note" className="text-xs">Observação</Label>
                    <Input id="note" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Salvando..." : "Salvar"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          </div>

          {cardio.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhuma sessão de cardio ainda.</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {cardio.map((item) => {
                const Icon = ACTIVITY_TYPES.find((t) => t.value === item.activity_type)?.icon ?? Activity;
                const label = ACTIVITY_TYPES.find((t) => t.value === item.activity_type)?.label ?? item.activity_type;
                return (
                  <li key={item.id}>
                    <Card>
                      <CardContent className="flex items-center gap-3 py-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate font-semibold">{label}</p>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {new Date(item.performed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {Math.round(Number(item.duration_minutes))} min
                            {item.distance_km ? ` · ${Number(item.distance_km).toFixed(2)} km` : ""}
                            {item.calories ? ` · ${item.calories} kcal` : ""}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deleteCardio(item.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {/* Sheet: registrar dia */}
      <Sheet open={openDay} onOpenChange={setOpenDay}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Atividade do dia</SheetTitle></SheetHeader>
          <form onSubmit={submitDay} className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="ddate" className="text-xs">Data</Label>
              <Input id="ddate" type="date" value={dDate} max={todayISO()} onChange={(e) => setDDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField id="ds" label="Passos" value={dSteps} onChange={setDSteps} />
              <NumField id="dc" label="Pontos cardio" value={dCardioPts} onChange={setDCardioPts} />
              <NumField id="de" label="Energia (kcal)" value={dEnergy} onChange={setDEnergy} />
              <NumField id="dd" label="Distância (km)" value={dDistance} onChange={setDDistance} />
            </div>
            <NumField id="dm" label="Minutos em movimento" value={dActiveMin} onChange={setDActiveMin} />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Sheet: metas */}
      <Sheet open={openGoals} onOpenChange={setOpenGoals}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader><SheetTitle><Target className="mr-2 inline h-5 w-5" />Suas metas</SheetTitle></SheetHeader>
          <form onSubmit={submitGoals} className="space-y-4 pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Diárias</p>
            <div className="grid grid-cols-2 gap-3">
              <NumField id="gs" label="Passos" value={String(gForm.daily_steps)} onChange={(v) => setGForm({ ...gForm, daily_steps: Number(v) || 0 })} />
              <NumField id="gc" label="Pontos cardio" value={String(gForm.daily_cardio_points)} onChange={(v) => setGForm({ ...gForm, daily_cardio_points: Number(v) || 0 })} />
              <NumField id="ge" label="Energia (kcal)" value={String(gForm.daily_energy_kcal)} onChange={(v) => setGForm({ ...gForm, daily_energy_kcal: Number(v) || 0 })} />
              <NumField id="gm" label="Minutos ativos" value={String(gForm.daily_active_minutes)} onChange={(v) => setGForm({ ...gForm, daily_active_minutes: Number(v) || 0 })} />
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Semanais</p>
            <div className="grid grid-cols-2 gap-3">
              <NumField id="gws" label="Passos" value={String(gForm.weekly_steps)} onChange={(v) => setGForm({ ...gForm, weekly_steps: Number(v) || 0 })} />
              <NumField id="gwc" label="Pontos cardio" value={String(gForm.weekly_cardio_points)} onChange={(v) => setGForm({ ...gForm, weekly_cardio_points: Number(v) || 0 })} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar metas"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============== Componentes ==============

function DualRing({ cardioPct, stepsPct, children }: { cardioPct: number; stepsPct: number; children: React.ReactNode }) {
  const size = 180;
  const stroke = 12;
  const r1 = (size - stroke) / 2;
  const r2 = r1 - stroke - 4;
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* outer track */}
        <circle cx={size / 2} cy={size / 2} r={r1} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" opacity={0.4} />
        <circle cx={size / 2} cy={size / 2} r={r1} stroke="var(--primary)" strokeWidth={stroke} fill="none"
          strokeDasharray={c1} strokeDashoffset={c1 - (c1 * cardioPct) / 100} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms" }} />
        {/* inner track */}
        <circle cx={size / 2} cy={size / 2} r={r2} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" opacity={0.4} />
        <circle cx={size / 2} cy={size / 2} r={r2} stroke="#3b82f6" strokeWidth={stroke} fill="none"
          strokeDasharray={c2} strokeDashoffset={c2 - (c2 * stepsPct) / 100} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: "primary" | "blue" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bg = color === "primary" ? "var(--primary)" : "#3b82f6";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bg }} />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        {icon}<span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-0.5 text-base font-bold">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function NumField({ id, label, value, onChange, required }: {
  id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" required={required}
        value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
