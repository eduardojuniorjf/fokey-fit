import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Check, Trash2, ListChecks, Flame, GlassWater } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HabitsHistoryCard } from "@/components/HabitsHistoryCard";

export const Route = createFileRoute("/_authenticated/habitos")({
  component: HabitosPage,
});

interface Habit {
  id: string;
  name: string;
  daily_target: number;
  unit: string | null;
  active: boolean;
  icon: string;
}

interface HabitLog {
  id: string;
  habit_id: string;
  logged_for: string;
  value: number;
}

const WATER_ICON = "water";
const CUP_ML = 350;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HabitosPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayLogs, setTodayLogs] = useState<HabitLog[]>([]);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("");

  const today = todayISO();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [h, l, w] = await Promise.all([
      supabase.from("habits").select("*").eq("active", true).order("created_at", { ascending: true }),
      supabase.from("habit_logs").select("*").eq("logged_for", today),
      supabase.from("weight_entries").select("weight_kg").order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (h.error) toast.error(h.error.message);
    if (l.error) toast.error(l.error.message);
    const habitsList = ((h.data ?? []) as Habit[]);
    const wkg = (w.data?.weight_kg as number | undefined) ?? null;
    setWeightKg(wkg);

    // Auto-create water habit if user has weight and no water habit yet
    let finalHabits = habitsList;
    if (wkg && !habitsList.some((x) => x.icon === WATER_ICON)) {
      const cups = Math.ceil((wkg * 40) / CUP_ML);
      const { data: created, error: cErr } = await supabase
        .from("habits")
        .insert({
          user_id: user.id,
          name: "Beber água",
          icon: WATER_ICON,
          daily_target: cups,
          unit: "copos",
        })
        .select()
        .single();
      if (cErr) toast.error(cErr.message);
      else if (created) finalHabits = [created as Habit, ...habitsList];
    } else if (wkg) {
      // Keep target in sync with current weight
      const water = habitsList.find((x) => x.icon === WATER_ICON);
      const cups = Math.ceil((wkg * 40) / CUP_ML);
      if (water && Number(water.daily_target) !== cups) {
        await supabase.from("habits").update({ daily_target: cups }).eq("id", water.id);
        finalHabits = habitsList.map((x) => (x.id === water.id ? { ...x, daily_target: cups } : x));
      }
    }
    setHabits(finalHabits);
    setTodayLogs((l.data ?? []) as HabitLog[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("habits").insert({
      user_id: user.id,
      name,
      daily_target: Number(target) || 1,
      unit: unit || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Hábito criado!");
    setName(""); setTarget("1"); setUnit("");
    setOpen(false);
    load();
  };

  const toggleHabit = async (habit: Habit) => {
    if (!user) return;
    const existing = todayLogs.find((l) => l.habit_id === habit.id);
    if (existing) {
      const { error } = await supabase.from("habit_logs").delete().eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("habit_logs").insert({
        user_id: user.id,
        habit_id: habit.id,
        logged_for: today,
        value: habit.daily_target,
      });
      if (error) return toast.error(error.message);
    }
    load();
  };

  const addWaterCup = async (habit: Habit) => {
    if (!user) return;
    const existing = todayLogs.find((l) => l.habit_id === habit.id);
    const consumed = existing ? Number(existing.value) : 0;
    if (consumed >= habit.daily_target) return;
    if (existing) {
      const { error } = await supabase
        .from("habit_logs")
        .update({ value: consumed + 1 })
        .eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("habit_logs").insert({
        user_id: user.id,
        habit_id: habit.id,
        logged_for: today,
        value: 1,
      });
      if (error) return toast.error(error.message);
    }
    load();
  };

  const removeWaterCup = async (habit: Habit) => {
    const existing = todayLogs.find((l) => l.habit_id === habit.id);
    if (!existing) return;
    const consumed = Number(existing.value);
    if (consumed <= 1) {
      const { error } = await supabase.from("habit_logs").delete().eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("habit_logs")
        .update({ value: consumed - 1 })
        .eq("id", existing.id);
      if (error) return toast.error(error.message);
    }
    load();
  };

  const removeHabit = async (id: string) => {
    if (!confirm("Apagar este hábito e todos os registros?")) return;
    const { error } = await supabase.from("habits").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removido."); load(); }
  };

  const isHabitDone = (h: Habit) => {
    if (h.icon === WATER_ICON) {
      const log = todayLogs.find((l) => l.habit_id === h.id);
      return !!log && Number(log.value) >= h.daily_target;
    }
    return todayLogs.some((l) => l.habit_id === h.id);
  };
  const completedCount = habits.filter(isHabitDone).length;
  const total = habits.length;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 lg:max-w-[1100px] lg:px-8 lg:pt-8">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Hábitos</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${completedCount} de ${total} hoje` : "Crie seu primeiro hábito"}
          </p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="rounded-full shadow-md">
              <Plus className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader><SheetTitle>Novo hábito</SheetTitle></SheetHeader>
            <form onSubmit={submit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="hn">Nome *</Label>
                <Input id="hn" required placeholder="Ex: Meditar 10 min"
                  value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ht">Meta diária</Label>
                  <Input id="ht" type="number" min="1" step="0.1"
                    value={target} onChange={(e) => setTarget(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hu">Unidade</Label>
                  <Input id="hu" placeholder="copos, min..." value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Salvando..." : "Criar hábito"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </header>

      {/* Streak indicator */}
      {total > 0 && (
        <Card className="mb-4 border-0" style={{ background: "var(--gradient-primary)" }}>
          <CardContent className="flex items-center gap-3 py-4 text-primary-foreground">
            <Flame className="h-8 w-8" />
            <div>
              <p className="text-xs opacity-80">Hoje</p>
              <p className="text-xl font-bold">{completedCount}/{total} hábitos</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : habits.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ListChecks className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum hábito ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {weightKg
                ? "Toque no + para criar."
                : "Cadastre seu peso em Medidas para liberar o hábito de água."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {habits.map((h) => {
            if (h.icon === WATER_ICON) {
              const log = todayLogs.find((l) => l.habit_id === h.id);
              const consumed = log ? Number(log.value) : 0;
              const target = h.daily_target;
              const ml = consumed * CUP_ML;
              const targetMl = target * CUP_ML;
              return (
                <li key={h.id}>
                  <Card className={cn("transition-colors", consumed >= target && "border-primary bg-primary/5")}>
                    <CardContent className="py-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex-1 overflow-hidden">
                          <p className="font-semibold">{h.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ml} / {targetMl} ml · {consumed}/{target} copos de {CUP_ML}ml
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeHabit(h.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: target }).map((_, i) => {
                          const filled = i < consumed;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => (filled ? removeWaterCup(h) : addWaterCup(h))}
                              aria-label={filled ? "Desmarcar copo" : "Marcar copo"}
                              className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-md border-2 transition-all",
                                filled
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background text-muted-foreground hover:border-primary",
                              )}
                            >
                              <GlassWater className={cn("h-5 w-5", filled ? "fill-primary/30" : "")} />
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            }
            const done = todayLogs.some((l) => l.habit_id === h.id);
            return (
              <li key={h.id}>
                <Card className={cn("transition-colors", done && "border-primary bg-primary/5")}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleHabit(h)}
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary",
                      )}
                      aria-label={done ? "Desmarcar" : "Marcar"}
                    >
                      <Check className={cn("h-5 w-5 transition-opacity", done ? "opacity-100" : "opacity-0")} />
                    </button>
                    <div className="flex-1 overflow-hidden">
                      <p className={cn("font-semibold", done && "line-through opacity-70")}>{h.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Meta: {Number(h.daily_target)} {h.unit ?? ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeHabit(h.id)}
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
    </div>
  );
}
