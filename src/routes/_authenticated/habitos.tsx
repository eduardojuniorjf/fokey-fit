import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Check, Trash2, ListChecks, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/habitos")({
  component: HabitosPage,
});

interface Habit {
  id: string;
  name: string;
  daily_target: number;
  unit: string | null;
  active: boolean;
}

interface HabitLog {
  id: string;
  habit_id: string;
  logged_for: string;
  value: number;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HabitosPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayLogs, setTodayLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("");

  const today = todayISO();

  const load = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("habits").select("*").eq("active", true).order("created_at", { ascending: true }),
      supabase.from("habit_logs").select("*").eq("logged_for", today),
    ]).then(([h, l]) => {
      if (h.error) toast.error(h.error.message); else setHabits((h.data ?? []) as Habit[]);
      if (l.error) toast.error(l.error.message); else setTodayLogs((l.data ?? []) as HabitLog[]);
      setLoading(false);
    });
  };
  useEffect(load, [user]);

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

  const removeHabit = async (id: string) => {
    if (!confirm("Apagar este hábito e todos os registros?")) return;
    const { error } = await supabase.from("habits").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removido."); load(); }
  };

  const completedCount = todayLogs.length;
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
                <Input id="hn" required placeholder="Ex: Beber 2L de água"
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
            <p className="mt-1 text-xs text-muted-foreground">Toque no + para criar.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {habits.map((h) => {
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
