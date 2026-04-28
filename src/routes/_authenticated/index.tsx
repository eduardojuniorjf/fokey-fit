import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Scale, ListChecks, TrendingUp, Flame, Timer } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

interface CardioRow {
  id: string;
  performed_at: string;
  duration_minutes: number;
  distance_km: number | null;
  calories: number | null;
}

interface WeightRow {
  recorded_at: string;
  weight_kg: number;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function DashboardPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [weekCardio, setWeekCardio] = useState<CardioRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    Promise.all([
      supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("cardio_activities")
        .select("id, performed_at, duration_minutes, distance_km, calories")
        .gte("performed_at", sevenDaysAgo.toISOString())
        .order("performed_at", { ascending: false }),
      supabase
        .from("weight_entries")
        .select("recorded_at, weight_kg")
        .order("recorded_at", { ascending: true })
        .limit(30),
    ])
      .then(([profileRes, cardioRes, weightRes]) => {
        if (profileRes.data) setDisplayName(profileRes.data.display_name);
        if (cardioRes.error) toast.error(cardioRes.error.message);
        else setWeekCardio((cardioRes.data ?? []) as CardioRow[]);
        if (weightRes.error) toast.error(weightRes.error.message);
        else setWeights((weightRes.data ?? []) as WeightRow[]);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const totalMinutes = weekCardio.reduce((sum, c) => sum + Number(c.duration_minutes), 0);
  const totalKm = weekCardio.reduce((sum, c) => sum + (Number(c.distance_km) || 0), 0);
  const totalCalories = weekCardio.reduce((sum, c) => sum + (c.calories || 0), 0);
  const sessions = weekCardio.length;

  const weightChartData = weights.map((w) => ({
    date: new Date(w.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    peso: Number(w.weight_kg),
  }));

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Hero header */}
      <header
        className="px-5 pb-8 pt-10 text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <p className="text-sm opacity-80">{greeting()},</p>
        <h1 className="mt-1 text-2xl font-bold">
          {displayName ?? user?.email?.split("@")[0] ?? "atleta"} 💪
        </h1>
        <p className="mt-2 text-sm opacity-75">Vamos para mais um dia de progresso.</p>
      </header>

      <div className="-mt-6 space-y-5 px-4">
        {/* Stats da semana */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Esta semana</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pb-5">
            <Stat icon={<Activity className="h-4 w-4" />} label="Sessões" value={sessions.toString()} />
            <Stat icon={<Timer className="h-4 w-4" />} label="Minutos" value={Math.round(totalMinutes).toString()} />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Distância" value={`${totalKm.toFixed(1)} km`} />
            <Stat icon={<Flame className="h-4 w-4" />} label="Calorias" value={totalCalories.toString()} />
          </CardContent>
        </Card>

        {/* Atalhos */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Registrar agora
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <QuickAction to="/atividades" icon={<Activity className="h-5 w-5" />} label="Cardio" />
            <QuickAction to="/medidas" icon={<Scale className="h-5 w-5" />} label="Peso" />
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
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="peso"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ fill: "var(--primary)", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: "/atividades" | "/medidas" | "/habitos"; icon: React.ReactNode; label: string }) {
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
