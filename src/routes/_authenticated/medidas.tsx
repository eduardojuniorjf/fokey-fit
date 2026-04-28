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
import { Plus, Scale, Ruler, Trash2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/medidas")({
  component: MedidasPage,
});

interface WeightRow { id: string; weight_kg: number; recorded_at: string; notes: string | null; }
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

function MedidasPage() {
  const { user } = useAuth();
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [measures, setMeasures] = useState<MeasureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openWeight, setOpenWeight] = useState(false);
  const [openMeasure, setOpenMeasure] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Weight form
  const [weight, setWeight] = useState("");
  // Measure form
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [chest, setChest] = useState("");
  const [arm, setArm] = useState("");
  const [thigh, setThigh] = useState("");
  const [bodyFat, setBodyFat] = useState("");

  const load = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("weight_entries").select("*").order("recorded_at", { ascending: false }).limit(60),
      supabase.from("body_measurements").select("*").order("recorded_at", { ascending: false }).limit(60),
    ]).then(([w, m]) => {
      if (w.error) toast.error(w.error.message); else setWeights((w.data ?? []) as WeightRow[]);
      if (m.error) toast.error(m.error.message); else setMeasures((m.data ?? []) as MeasureRow[]);
      setLoading(false);
    });
  };
  useEffect(load, [user]);

  const submitWeight = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("weight_entries").insert({
      user_id: user.id,
      weight_kg: Number(weight),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Peso registrado!");
    setWeight(""); setOpenWeight(false); load();
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

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Medidas</h1>
        <p className="text-sm text-muted-foreground">Acompanhe peso e medidas corporais</p>
      </header>

      <Tabs defaultValue="weight">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="weight"><Scale className="mr-2 h-4 w-4" />Peso</TabsTrigger>
          <TabsTrigger value="measure"><Ruler className="mr-2 h-4 w-4" />Medidas</TabsTrigger>
        </TabsList>

        {/* PESO */}
        <TabsContent value="weight" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Evolução</CardTitle>
              <Sheet open={openWeight} onOpenChange={setOpenWeight}>
                <SheetTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" />Registrar</Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl">
                  <SheetHeader><SheetTitle>Novo peso</SheetTitle></SheetHeader>
                  <form onSubmit={submitWeight} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="w">Peso (kg) *</Label>
                      <Input id="w" type="number" inputMode="decimal" required min="1" step="0.1"
                        value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
                    </div>
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
                    <div>
                      <p className="font-semibold">{Number(w.weight_kg).toFixed(1)} kg</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
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
    </div>
  );
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step="0.1"
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
