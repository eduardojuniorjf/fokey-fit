import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Scale, Ruler, Trash2, Target, Flame, Droplet, TrendingDown, Pencil, CalendarIcon } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/medidas")({
  component: MedidasPage,
});

interface WeightRow {
  id: string;
  weight_kg: number;
  recorded_at: string;
  notes: string | null;
  calories_burned: number | null;
  calories_consumed: number | null;
  water_liters: number | null;
}
interface MeasureRow {
  id: string;
  recorded_at: string;
  waist_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  body_fat_pct: number | null;
}
interface Goal {
  id: string;
  start_date: string;
  start_weight_kg: number;
  height_cm: number;
  target_weight_kg: number;
  target_date: string;
  active: boolean;
}

function bmiCategory(bmi: number) {
  if (bmi < 18.5) return { label: "Abaixo do peso", color: "text-blue-500" };
  if (bmi < 25) return { label: "Peso normal", color: "text-emerald-500" };
  if (bmi < 30) return { label: "Acima do peso", color: "text-amber-500" };
  if (bmi < 35) return { label: "Obesidade I", color: "text-orange-500" };
  if (bmi < 40) return { label: "Obesidade II", color: "text-red-500" };
  return { label: "Obesidade mórbida", color: "text-red-700" };
}

function MedidasPage() {
  const { user } = useAuth();
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [measures, setMeasures] = useState<MeasureRow[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [openWeight, setOpenWeight] = useState(false);
  const [openMeasure, setOpenMeasure] = useState(false);
  const [openGoal, setOpenGoal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Weight form
  const [weight, setWeight] = useState("");
  const [calBurned, setCalBurned] = useState("");
  const [calConsumed, setCalConsumed] = useState("");
  const [water, setWater] = useState("");

  // Measure form
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [chest, setChest] = useState("");
  const [arm, setArm] = useState("");
  const [thigh, setThigh] = useState("");
  const [bodyFat, setBodyFat] = useState("");

  // Goal form
  const [gStartWeight, setGStartWeight] = useState("");
  const [gHeight, setGHeight] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gStartDate, setGStartDate] = useState<Date | undefined>(new Date());
  const [gTargetDate, setGTargetDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d;
  });

  const load = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("weight_entries").select("*").order("recorded_at", { ascending: false }).limit(180),
      supabase.from("body_measurements").select("*").order("recorded_at", { ascending: false }).limit(60),
      supabase.from("weight_goals").select("*").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([w, m, g]) => {
      if (w.error) toast.error(w.error.message); else setWeights((w.data ?? []) as WeightRow[]);
      if (m.error) toast.error(m.error.message); else setMeasures((m.data ?? []) as MeasureRow[]);
      if (!g.error) setGoal((g.data as Goal | null) ?? null);
      setLoading(false);
    });
  };
  useEffect(load, [user]);

  // Pré-preenche o form de meta com dados atuais quando abrir
  useEffect(() => {
    if (openGoal && goal) {
      setGStartWeight(String(goal.start_weight_kg));
      setGHeight(String(goal.height_cm));
      setGTarget(String(goal.target_weight_kg));
      setGStartDate(new Date(goal.start_date + "T00:00"));
      setGTargetDate(new Date(goal.target_date + "T00:00"));
    } else if (openGoal && !goal) {
      const lastWeight = weights[0]?.weight_kg;
      if (lastWeight) setGStartWeight(String(lastWeight));
      setGStartDate(new Date());
      const t = new Date();
      t.setMonth(t.getMonth() + 3);
      setGTargetDate(t);
    }
  }, [openGoal, goal, weights]);

  const submitWeight = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("weight_entries").insert({
      user_id: user.id,
      weight_kg: Number(weight),
      calories_burned: calBurned ? Number(calBurned) : null,
      calories_consumed: calConsumed ? Number(calConsumed) : null,
      water_liters: water ? Number(water) : null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Registro salvo!");
    setWeight(""); setCalBurned(""); setCalConsumed(""); setWater("");
    setOpenWeight(false); load();
  };

  const submitMeasure = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("body_measurements").insert({
      user_id: user.id,
      waist_cm: waist ? Number(waist) : null,
      hip_cm: hip ? Number(hip) : null,
      chest_cm: chest ? Number(chest) : null,
      arm_cm: arm ? Number(arm) : null,
      thigh_cm: thigh ? Number(thigh) : null,
      body_fat_pct: bodyFat ? Number(bodyFat) : null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Medidas registradas!");
    setWaist(""); setHip(""); setChest(""); setArm(""); setThigh(""); setBodyFat("");
    setOpenMeasure(false); load();
  };

  const submitGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!gStartDate || !gTargetDate) {
      toast.error("Selecione as datas inicial e final.");
      return;
    }
    if (gTargetDate <= gStartDate) {
      toast.error("A data final deve ser posterior à inicial.");
      return;
    }
    setSubmitting(true);
    const toISO = (d: Date) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    };
    const payload = {
      user_id: user.id,
      start_date: toISO(gStartDate),
      start_weight_kg: Number(gStartWeight),
      height_cm: Number(gHeight),
      target_weight_kg: Number(gTarget),
      target_date: toISO(gTargetDate),
      active: true,
    };
    const { error } = goal
      ? await supabase.from("weight_goals").update(payload).eq("id", goal.id)
      : await supabase.from("weight_goals").insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Meta salva!");
    setOpenGoal(false); load();
  };

  const deleteRow = async (table: "weight_entries" | "body_measurements", id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removido."); load(); }
  };

  const weightChart = [...weights]
    .reverse()
    .map((w) => ({
      date: new Date(w.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      peso: Number(w.weight_kg),
    }));

  // ---- Meta calculations ----
  const currentWeight = weights[0]?.weight_kg ?? goal?.start_weight_kg;
  const bmi = goal && currentWeight ? Number(currentWeight) / Math.pow(goal.height_cm / 100, 2) : null;
  const cat = bmi ? bmiCategory(bmi) : null;
  const totalToLose = goal ? goal.start_weight_kg - goal.target_weight_kg : 0;
  const lostSoFar = goal && currentWeight ? goal.start_weight_kg - Number(currentWeight) : 0;
  const progressPct = totalToLose > 0 ? Math.max(0, Math.min(100, (lostSoFar / totalToLose) * 100)) : 0;
  const daysLeft = goal
    ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Medidas & Meta</h1>
        <p className="text-sm text-muted-foreground">Acompanhe peso, medidas e progresso</p>
      </header>

      <Tabs defaultValue="weight">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="goal"><Target className="mr-1.5 h-4 w-4" />Meta</TabsTrigger>
          <TabsTrigger value="weight"><Scale className="mr-1.5 h-4 w-4" />Peso</TabsTrigger>
          <TabsTrigger value="measure"><Ruler className="mr-1.5 h-4 w-4" />Medidas</TabsTrigger>
        </TabsList>

        {/* META */}
        <TabsContent value="goal" className="mt-4 space-y-4">
          {!goal ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="mb-4 text-sm text-muted-foreground">
                  Defina sua meta de perda de peso para acompanhar o progresso.
                </p>
                <Button onClick={() => setOpenGoal(true)}><Plus className="mr-1 h-4 w-4" />Criar meta</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-0 shadow-md" style={{ background: "var(--gradient-hero)" }}>
                <CardContent className="p-5 text-primary-foreground">
                  <p className="text-xs uppercase tracking-wider opacity-80">Progresso rumo à meta</p>
                  <p className="mt-1 text-3xl font-bold">{progressPct.toFixed(0)}%</p>
                  <Progress value={progressPct} className="mt-3 bg-white/20" />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="opacity-75">Inicial</p>
                      <p className="font-semibold">{Number(goal.start_weight_kg).toFixed(1)} kg</p>
                    </div>
                    <div>
                      <p className="opacity-75">Atual</p>
                      <p className="font-semibold">{currentWeight ? Number(currentWeight).toFixed(1) : "—"} kg</p>
                    </div>
                    <div>
                      <p className="opacity-75">Meta</p>
                      <p className="font-semibold">{Number(goal.target_weight_kg).toFixed(1)} kg</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">IMC</p>
                    <p className="mt-1 text-2xl font-bold">{bmi ? bmi.toFixed(1) : "—"}</p>
                    {cat && <p className={`text-xs font-medium ${cat.color}`}>{cat.label}</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Faltam</p>
                    <p className="mt-1 text-2xl font-bold">{daysLeft}</p>
                    <p className="text-xs text-muted-foreground">dias até {new Date(goal.target_date).toLocaleDateString("pt-BR")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Já perdeu</p>
                    <p className="mt-1 text-2xl font-bold text-primary">{lostSoFar.toFixed(1)} kg</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Falta perder</p>
                    <p className="mt-1 text-2xl font-bold">{Math.max(0, totalToLose - lostSoFar).toFixed(1)} kg</p>
                  </CardContent>
                </Card>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setOpenGoal(true)}>
                <Pencil className="mr-2 h-4 w-4" />Editar meta
              </Button>
            </>
          )}

          <Sheet open={openGoal} onOpenChange={setOpenGoal}>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>{goal ? "Editar meta" : "Criar meta"}</SheetTitle></SheetHeader>
              <form onSubmit={submitGoal} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field id="sw" label="Peso inicial (kg)" value={gStartWeight} onChange={setGStartWeight} required />
                  <Field id="h" label="Altura (cm)" value={gHeight} onChange={setGHeight} required />
                  <Field id="tw" label="Peso alvo (kg)" value={gTarget} onChange={setGTarget} required />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data inicial</Label>
                    <DateField date={gStartDate} onChange={setGStartDate} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs">Data final (objetivo)</Label>
                    <DateField date={gTargetDate} onChange={setGTargetDate} minDate={gStartDate} />
                  </div>
                </div>
                {gStartDate && gTargetDate && gTargetDate > gStartDate && (
                  <p className="text-xs text-muted-foreground">
                    Período: {Math.ceil((gTargetDate.getTime() - gStartDate.getTime()) / (1000 * 60 * 60 * 24))} dias
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Salvando..." : "Salvar meta"}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* PESO */}
        <TabsContent value="weight" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Evolução</CardTitle>
              <Sheet open={openWeight} onOpenChange={setOpenWeight}>
                <SheetTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" />Registrar</Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
                  <SheetHeader><SheetTitle>Registro do dia</SheetTitle></SheetHeader>
                  <form onSubmit={submitWeight} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="w">Peso (kg) *</Label>
                      <Input id="w" type="number" inputMode="decimal" required min="1" step="0.1"
                        value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="cb" label="Cal. queimadas" value={calBurned} onChange={setCalBurned} />
                      <Field id="cc" label="Cal. consumidas" value={calConsumed} onChange={setCalConsumed} />
                    </div>
                    <Field id="wt" label="Água (litros)" value={water} onChange={setWater} />
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "Salvando..." : "Salvar"}
                    </Button>
                  </form>
                </SheetContent>
              </Sheet>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-40 animate-pulse rounded-md bg-muted" />
              ) : weightChart.length < 2 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Registre ao menos 2 pesos para ver o gráfico.
                </p>
              ) : (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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

          <ul className="space-y-2">
            {weights.map((w) => (
              <li key={w.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex-1">
                      <p className="font-semibold">{Number(w.weight_kg).toFixed(1)} kg</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                      {(w.calories_burned || w.calories_consumed || w.water_liters) && (
                        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {w.calories_burned != null && <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" />{w.calories_burned} kcal</span>}
                          {w.calories_consumed != null && <span>🍽 {w.calories_consumed} kcal</span>}
                          {w.water_liters != null && <span className="inline-flex items-center gap-1"><Droplet className="h-3 w-3" />{w.water_liters} L</span>}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteRow("weight_entries", w.id)}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </TabsContent>

        {/* MEDIDAS */}
        <TabsContent value="measure" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Sheet open={openMeasure} onOpenChange={setOpenMeasure}>
              <SheetTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Registrar</Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
                <SheetHeader><SheetTitle>Novas medidas</SheetTitle></SheetHeader>
                <form onSubmit={submitMeasure} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="waist" label="Cintura (cm)" value={waist} onChange={setWaist} />
                    <Field id="hip" label="Quadril (cm)" value={hip} onChange={setHip} />
                    <Field id="chest" label="Peito (cm)" value={chest} onChange={setChest} />
                    <Field id="arm" label="Braço (cm)" value={arm} onChange={setArm} />
                    <Field id="thigh" label="Coxa (cm)" value={thigh} onChange={setThigh} />
                    <Field id="bf" label="% Gordura" value={bodyFat} onChange={setBodyFat} />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Salvando..." : "Salvar"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          </div>

          {measures.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Ruler className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhuma medida registrada.</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {measures.map((m) => (
                <li key={m.id}>
                  <Card>
                    <CardContent className="py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {new Date(m.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                        </p>
                        <Button variant="ghost" size="icon" onClick={() => deleteRow("body_measurements", m.id)}
                          className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {m.waist_cm && <Pill label="Cintura" value={`${m.waist_cm} cm`} />}
                        {m.hip_cm && <Pill label="Quadril" value={`${m.hip_cm} cm`} />}
                        {m.chest_cm && <Pill label="Peito" value={`${m.chest_cm} cm`} />}
                        {m.arm_cm && <Pill label="Braço" value={`${m.arm_cm} cm`} />}
                        {m.thigh_cm && <Pill label="Coxa" value={`${m.thigh_cm} cm`} />}
                        {m.body_fat_pct && <Pill label="Gordura" value={`${m.body_fat_pct}%`} />}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {/* Hint visual */}
      {goal && progressPct >= 100 && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary/10 p-3 text-sm font-medium text-primary">
          <TrendingDown className="h-4 w-4" /> Meta alcançada! 🎉
        </div>
      )}
    </div>
  );
}

function Field({ id, label, value, onChange, required }: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step="0.1" required={required}
        value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DateField({
  date, onChange, minDate,
}: { date: Date | undefined; onChange: (d: Date | undefined) => void; minDate?: Date }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Selecionar data"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          disabled={minDate ? (d) => d <= minDate : undefined}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
