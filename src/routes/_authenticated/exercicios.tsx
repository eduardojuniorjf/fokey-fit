import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, Pencil, Footprints, Bike, Waves, Dumbbell,
  PersonStanding, RotateCw, Activity, Heart, Flame, MapPin, Timer, Download,
} from "lucide-react";
import { toast } from "sonner";
import { syncStrava } from "@/lib/strava/strava.functions";
import { syncGoogleFit } from "@/lib/google-fit/google-fit.functions";

export const Route = createFileRoute("/_authenticated/exercicios")({
  component: ExerciciosPage,
});

interface CardioRow {
  id: string;
  activity_type: string;
  performed_at: string;
  duration_minutes: number;
  distance_km: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  steps: number | null;
  cardio_points: number | null;
  source: string;
  notes: string | null;
}


interface WorkoutType {
  value: string;
  label: string;
  icon: typeof Activity;
  custom?: boolean;
}

const PRESET_TYPES: WorkoutType[] = [
  { value: "treadmill", label: "Esteira", icon: RotateCw },
  { value: "running", label: "Corrida", icon: Footprints },
  { value: "walking", label: "Caminhada", icon: PersonStanding },
  { value: "cycling", label: "Ciclismo", icon: Bike },
  { value: "tennis", label: "Tênis", icon: Activity },
  { value: "swimming", label: "Natação", icon: Waves },
];

const CUSTOM_TYPES_KEY = "fokey_custom_workout_types";
const IMPORT_PREFS_KEY = "fokey_import_prefs";

function loadCustomTypes(): WorkoutType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TYPES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as { value: string; label: string }[];
    return arr.map((x) => ({ ...x, icon: Dumbbell, custom: true }));
  } catch { return []; }
}
function saveCustomTypes(list: WorkoutType[]) {
  const stripped = list.map(({ value, label }) => ({ value, label }));
  localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(stripped));
}

function loadImportPrefs() {
  if (typeof window === "undefined") return { strava: false, googleFit: false };
  try {
    const raw = localStorage.getItem(IMPORT_PREFS_KEY);
    if (!raw) return { strava: false, googleFit: false };
    return JSON.parse(raw) as { strava: boolean; googleFit: boolean };
  } catch { return { strava: false, googleFit: false }; }
}
function saveImportPrefs(p: { strava: boolean; googleFit: boolean }) {
  localStorage.setItem(IMPORT_PREFS_KEY, JSON.stringify(p));
}

const EXERCISE_HABIT_ICON = "exercise";

/** Recompute the "Exercício físico" habit log for a given date as the sum
 *  of all cardio_activities durations on that date. Creates the habit if missing. */
async function syncExerciseHabitForDate(userId: string, dateISO: string) {
  // Find or create the exercise habit
  let { data: habit } = await supabase
    .from("habits")
    .select("id")
    .eq("user_id", userId)
    .eq("icon", EXERCISE_HABIT_ICON)
    .eq("active", true)
    .maybeSingle();
  if (!habit) {
    const { data: created } = await supabase
      .from("habits")
      .insert({
        user_id: userId,
        name: "Exercício físico",
        icon: EXERCISE_HABIT_ICON,
        daily_target: 150,
        unit: "min",
      })
      .select("id")
      .single();
    habit = created;
  }
  if (!habit) return;

  // Sum durations of activities performed on that date (local day boundaries)
  const start = new Date(`${dateISO}T00:00:00`);
  const end = new Date(`${dateISO}T23:59:59.999`);
  const { data: acts } = await supabase
    .from("cardio_activities")
    .select("duration_minutes")
    .eq("user_id", userId)
    .gte("performed_at", start.toISOString())
    .lte("performed_at", end.toISOString());
  const total = (acts ?? []).reduce(
    (s, a: { duration_minutes: number | null }) => s + Number(a.duration_minutes ?? 0),
    0,
  );

  // Replace any existing log for this habit+date with a single aggregated entry
  await supabase
    .from("habit_logs")
    .delete()
    .eq("habit_id", habit.id)
    .eq("logged_for", dateISO);
  if (total > 0) {
    await supabase.from("habit_logs").insert({
      user_id: userId,
      habit_id: habit.id,
      logged_for: dateISO,
      value: total,
    });
  }
}

function dateOnly(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function ExerciciosPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CardioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customTypes, setCustomTypes] = useState<WorkoutType[]>([]);

  const [importStrava, setImportStrava] = useState(false);
  const [importGoogleFit, setImportGoogleFit] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form (used for both create and edit)
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CardioRow | null>(null);
  const [fType, setFType] = useState("running");
  const [fDate, setFDate] = useState("");
  const [fDur, setFDur] = useState("");
  const [fHr, setFHr] = useState("");
  const [fCal, setFCal] = useState("");
  const [fKm, setFKm] = useState("");
  const [fSteps, setFSteps] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Custom type sheet
  const [openCustom, setOpenCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<CardioRow | null>(null);

  const syncStravaFn = useServerFn(syncStrava);
  const syncGoogleFitFn = useServerFn(syncGoogleFit);

  const allTypes = useMemo<WorkoutType[]>(
    () => [...PRESET_TYPES, ...customTypes],
    [customTypes],
  );

  const findType = (v: string): WorkoutType =>
    allTypes.find((t) => t.value === v) ?? { value: v, label: v, icon: Activity };

  useEffect(() => {
    setCustomTypes(loadCustomTypes());
    const p = loadImportPrefs();
    setImportStrava(p.strava);
    setImportGoogleFit(p.googleFit);
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cardio_activities")
      .select("*")
      .order("performed_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    else {
      const rows = (data ?? []) as CardioRow[];
      setItems(rows);
      // Heal habit logs: re-sync the exercise habit for every date that has
      // activities, so manual/imported workouts always reflect on Hábitos.
      const uniqueDates = Array.from(new Set(rows.map((r) => dateOnly(r.performed_at))));
      await Promise.all(uniqueDates.map((d) => syncExerciseHabitForDate(user.id, d)));
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const runImport = async (which: "strava" | "googleFit") => {
    setSyncing(true);
    try {
      if (which === "strava") {
        const r = await syncStravaFn();
        toast.success(`Strava: ${r.activityCount} atividades importadas`);
      } else {
        const r = await syncGoogleFitFn({ data: { tzOffsetMinutes: -new Date().getTimezoneOffset() } });
        toast.success(`Google Fit: ${r.sessionCount ?? 0} treinos, ${r.activityCount} dias importados`);

      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setSyncing(false);
    }
  };

  const toggleImport = async (which: "strava" | "googleFit", value: boolean) => {
    if (which === "strava") setImportStrava(value);
    else setImportGoogleFit(value);
    saveImportPrefs({
      strava: which === "strava" ? value : importStrava,
      googleFit: which === "googleFit" ? value : importGoogleFit,
    });
    if (value) await runImport(which);
  };

  const openNew = (typeValue?: string) => {
    setEditing(null);
    setFType(typeValue ?? "running");
    setFDate(new Date().toISOString().slice(0, 16));
    setFDur(""); setFHr(""); setFCal(""); setFKm(""); setFSteps(""); setFNotes("");
    setOpen(true);
  };

  const openEdit = (row: CardioRow) => {
    setEditing(row);
    setFType(row.activity_type);
    setFDate(new Date(row.performed_at).toISOString().slice(0, 16));
    setFDur(row.duration_minutes ? String(row.duration_minutes) : "");
    setFHr(row.avg_heart_rate ? String(row.avg_heart_rate) : "");
    setFCal(row.calories ? String(row.calories) : "");
    setFKm(row.distance_km ? String(row.distance_km) : "");
    setFSteps(row.steps ? String(row.steps) : "");
    setFNotes(row.notes ?? "");
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const performedAt = fDate ? new Date(fDate) : new Date();
    const payload = {
      user_id: user.id,
      activity_type: fType,
      performed_at: performedAt.toISOString(),
      duration_minutes: fDur ? Number(fDur) : 0,
      avg_heart_rate: fHr ? Number(fHr) : null,
      calories: fCal ? Number(fCal) : null,
      distance_km: fKm ? Number(fKm) : null,
      steps: fSteps ? Number(fSteps) : null,
      notes: fNotes || null,
    };
    const previousDate = editing ? dateOnly(editing.performed_at) : null;
    const { error } = editing
      ? await supabase.from("cardio_activities").update(payload).eq("id", editing.id)
      : await supabase.from("cardio_activities").insert({ ...payload, source: "manual" });
    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }
    // Sync the exercise habit for the affected date(s)
    const newDate = dateOnly(performedAt);
    await syncExerciseHabitForDate(user.id, newDate);
    if (previousDate && previousDate !== newDate) {
      await syncExerciseHabitForDate(user.id, previousDate);
    }
    setSubmitting(false);
    toast.success(editing ? "Treino atualizado!" : "Treino registrado!");
    setOpen(false);
    setEditing(null);
    load();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const affectedDate = dateOnly(confirmDelete.performed_at);
    const { error } = await supabase.from("cardio_activities").delete().eq("id", confirmDelete.id);
    if (error) toast.error(error.message);
    else {
      if (user) await syncExerciseHabitForDate(user.id, affectedDate);
      toast.success("Treino excluído.");
      load();
    }
    setConfirmDelete(null);
  };
  const addCustomType = (e: FormEvent) => {
    e.preventDefault();
    const label = customLabel.trim();
    if (!label) return;
    const value = `custom_${Date.now()}`;
    const next = [...customTypes, { value, label, icon: Dumbbell, custom: true }];
    setCustomTypes(next);
    saveCustomTypes(next);
    setCustomLabel("");
    setOpenCustom(false);
    toast.success(`"${label}" adicionado aos seus treinos!`);
    openNew(value);
  };

  const removeCustomType = (value: string) => {
    const next = customTypes.filter((t) => t.value !== value);
    setCustomTypes(next);
    saveCustomTypes(next);
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-24 lg:max-w-[1200px] lg:px-8 lg:pt-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold lg:text-3xl">Exercícios</h1>
        <p className="text-sm text-muted-foreground">Registre seus treinos e importe das suas integrações</p>
      </header>

      {/* Import switches */}
      <Card className="mb-5">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Importar do Strava</p>
                <p className="text-xs text-muted-foreground">Atividades dos últimos 30 dias</p>
              </div>
            </div>
            <Switch
              checked={importStrava}
              disabled={syncing}
              onCheckedChange={(v) => toggleImport("strava", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Importar do Google Fit</p>
                <p className="text-xs text-muted-foreground">Passos, calorias e distância dos últimos 7 dias</p>
              </div>
            </div>
            <Switch
              checked={importGoogleFit}
              disabled={syncing}
              onCheckedChange={(v) => toggleImport("googleFit", v)}
            />
          </div>
          {(importStrava || importGoogleFit) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={syncing}
              onClick={async () => {
                if (importStrava) await runImport("strava");
                if (importGoogleFit) await runImport("googleFit");
              }}
            >
              <RotateCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Workout type buttons */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tipos de treino</h2>
        <Sheet open={openCustom} onOpenChange={setOpenCustom}>
          <SheetTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Plus className="mr-1 h-3 w-3" /> Criar treino
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader><SheetTitle>Criar treino personalizado</SheetTitle></SheetHeader>
            <form onSubmit={addCustomType} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="cl">Nome do treino *</Label>
                <Input id="cl" required autoFocus placeholder="Ex: Crossfit, Yoga, Boxe..."
                  value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
              </div>
              <Button type="submit" className="w-full">Criar e registrar</Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 lg:grid-cols-6">
        {allTypes.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.value} className="relative">
              <button
                type="button"
                onClick={() => openNew(t.value)}
                className="group flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-border bg-card px-2 py-3 text-xs font-medium transition-all hover:border-primary hover:bg-primary/5"
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="line-clamp-1">{t.label}</span>
              </button>
              {t.custom && (
                <button
                  type="button"
                  onClick={() => removeCustomType(t.value)}
                  className="absolute -right-1 -top-1 rounded-full bg-muted p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  aria-label="Remover tipo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* History */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Histórico</h2>
        <span className="text-xs text-muted-foreground">{items.length} treinos</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Dumbbell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum treino ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">Toque em um tipo acima para registrar.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {items.map((item) => {
            const t = findType(item.activity_type);
            const Icon = t.icon;
            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-semibold">{t.label}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(item.performed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {item.duration_minutes > 0 && (
                            <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />{Math.round(Number(item.duration_minutes))} min</span>
                          )}
                          {item.distance_km && (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{Number(item.distance_km).toFixed(2)} km</span>
                          )}
                          {item.calories && (
                            <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" />{item.calories} kcal</span>
                          )}
                          {item.avg_heart_rate && (
                            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{item.avg_heart_rate} bpm</span>
                          )}
                          {item.cardio_points != null && item.cardio_points > 0 && (
                            <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" />{item.cardio_points} pts cardio</span>
                          )}
                          {item.steps && (
                            <span className="inline-flex items-center gap-1"><Footprints className="h-3 w-3" />{item.steps.toLocaleString("pt-BR")}</span>
                          )}

                        </div>
                        {item.source !== "manual" && (
                          <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {item.source}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(item)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDelete(item)} aria-label="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* New / Edit sheet */}
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editing ? "Editar treino" : `Novo treino — ${findType(fType).label}`}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="fdate" className="text-xs">Data e hora</Label>
              <Input id="fdate" type="datetime-local" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField id="fdur" label="Duração (min)" value={fDur} onChange={setFDur} />
              <NumField id="fhr" label="FC média (bpm)" value={fHr} onChange={setFHr} />
              <NumField id="fcal" label="Queima (kcal)" value={fCal} onChange={setFCal} />
              <NumField id="fkm" label="Distância (km)" value={fKm} onChange={setFKm} />
            </div>
            <NumField id="fst" label="Passos" value={fSteps} onChange={setFSteps} />
            <div className="space-y-1.5">
              <Label htmlFor="fno" className="text-xs">Observação</Label>
              <Input id="fno" value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Como foi o treino?" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Todos os campos são opcionais. Você pode importar dados automaticamente do Strava e Google Fit acima.
            </p>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Registrar treino"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este treino?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  <strong>{findType(confirmDelete.activity_type).label}</strong> de{" "}
                  {new Date(confirmDelete.performed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}.
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NumField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step="0.01"
        value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
