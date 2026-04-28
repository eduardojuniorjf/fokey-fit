import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Activity, Trash2, Bike, Footprints, Waves, Dumbbell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atividades")({
  component: AtividadesPage,
});

interface CardioRow {
  id: string;
  activity_type: string;
  performed_at: string;
  duration_minutes: number;
  distance_km: number | null;
  calories: number | null;
  notes: string | null;
}

const ACTIVITY_TYPES = [
  { value: "running", label: "Corrida", icon: Footprints },
  { value: "walking", label: "Caminhada", icon: Footprints },
  { value: "cycling", label: "Ciclismo", icon: Bike },
  { value: "swimming", label: "Natação", icon: Waves },
  { value: "other", label: "Outro", icon: Dumbbell },
];

function iconFor(type: string) {
  return ACTIVITY_TYPES.find((t) => t.value === type)?.icon ?? Activity;
}

function labelFor(type: string) {
  return ACTIVITY_TYPES.find((t) => t.value === type)?.label ?? type;
}

function AtividadesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CardioRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState("running");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");

  const load = () => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("cardio_activities")
      .select("*")
      .order("performed_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setItems((data ?? []) as CardioRow[]);
        setLoading(false);
      });
  };

  useEffect(load, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("cardio_activities").insert({
      user_id: user.id,
      activity_type: type,
      duration_minutes: Number(duration),
      distance_km: distance ? Number(distance) : null,
      calories: calories ? Number(calories) : null,
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Atividade registrada!");
    setOpen(false);
    setDuration("");
    setDistance("");
    setCalories("");
    setNotes("");
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("cardio_activities").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removido.");
      load();
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atividades</h1>
          <p className="text-sm text-muted-foreground">Suas corridas e cardio</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="rounded-full shadow-md">
              <Plus className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Nova atividade</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="dur">Minutos *</Label>
                  <Input id="dur" type="number" inputMode="decimal" required min="1" step="0.1"
                    value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dist">Distância (km)</Label>
                  <Input id="dist" type="number" inputMode="decimal" min="0" step="0.01"
                    value={distance} onChange={(e) => setDistance(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cal">Calorias</Label>
                <Input id="cal" type="number" inputMode="numeric" min="0"
                  value={calories} onChange={(e) => setCalories(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">Observação</Label>
                <Input id="note" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">Toque no + para registrar a primeira.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const Icon = iconFor(item.activity_type);
            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold">{labelFor(item.activity_type)}</p>
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
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}
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
