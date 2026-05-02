import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Activity } from "lucide-react";

export interface ActivityRow {
  recorded_for: string; // YYYY-MM-DD
  steps: number;
  cardio_points: number;
}

type Range = "7d" | "15d" | "30d" | "month";
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Função robusta: extrai a data puramente local, ignorando UTC
function isoDate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ActivityChartCard({ activity }: { activity: ActivityRow[] }) {
  const [range, setRange] = useState<Range>("7d");
  const [monthOffset, setMonthOffset] = useState(0);

  // Referência estável de "agora" para todos os cálculos do componente
  const nowReference = useMemo(() => {
    const d = new Date();
    // Normalizamos para o início do dia local para evitar saltos de fuso durante o uso
    return d;
  }, []);

  const monthOptions = useMemo(() => {
    const opts: { offset: number; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      // Usamos o dia 1 para evitar problemas de meses com durações diferentes (ex: 31 de Março -> Fevereiro)
      const d = new Date(nowReference.getFullYear(), nowReference.getMonth() - i, 1);
      opts.push({
        offset: i,
        label: i === 0 ? `${MONTHS[d.getMonth()]} (atual)` : `${MONTHS[d.getMonth()]}/${d.getFullYear()}`,
      });
    }
    return opts;
  }, [nowReference]);

  const data = useMemo(() => {
    const map = new Map<string, ActivityRow>();
    activity.forEach((a) => map.set(a.recorded_for, a));

    if (range === "month") {
      // Garantimos que o alvo seja sempre o dia 1 do mês selecionado
      const target = new Date(nowReference.getFullYear(), nowReference.getMonth() - monthOffset, 1);
      const year = target.getFullYear();
      const month = target.getMonth();

      // Pega o último dia do mês corretamente
      const lastDay = new Date(year, month + 1, 0).getDate();
      const out: { date: string; passos: number; cardio: number; full: string }[] = [];

      for (let day = 1; day <= lastDay; day++) {
        const d = new Date(year, month, day);
        const iso = isoDate(d);
        const row = map.get(iso);
        out.push({
          date: String(day),
          full: d.toLocaleDateString("pt-BR"),
          passos: row?.steps ?? 0,
          cardio: row?.cardio_points ?? 0,
        });
      }
      return out;
    }

    const daysCount = range === "7d" ? 7 : range === "15d" ? 15 : 30;
    const out: { date: string; passos: number; cardio: number; full: string }[] = [];

    // Criamos uma cópia de hoje e zeramos as horas para garantir precisão no loop
    const today = new Date(nowReference);
    today.setHours(0, 0, 0, 0);

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);

      const iso = isoDate(d);
      const row = map.get(iso);

      out.push({
        date:
          daysCount <= 7
            ? d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
            : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        full: d.toLocaleDateString("pt-BR"),
        passos: row?.steps ?? 0,
        cardio: row?.cardio_points ?? 0,
      });
    }
    return out;
  }, [activity, range, monthOffset, nowReference]);

  const totalSteps = data.reduce((s, d) => s + d.passos, 0);
  const totalCardio = data.reduce((s, d) => s + d.cardio, 0);
  const activeDays = data.filter((d) => d.passos > 0 || d.cardio > 0).length;
  const avgSteps = data.length ? Math.round(totalSteps / data.length) : 0;

  const periodLabel: Record<Range, string> = {
    "7d": "7 dias",
    "15d": "15 dias",
    "30d": "30 dias",
    month: "Mês",
  };

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Atividade — {periodLabel[range]}
          </CardTitle>
          <div className="flex items-center gap-2">
            {range === "month" && (
              <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.offset} value={String(m.offset)} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ToggleGroup
              type="single"
              size="sm"
              value={range}
              onValueChange={(v) => v && setRange(v as Range)}
              className="rounded-md border border-border bg-muted/40 p-0.5"
            >
              <ToggleGroupItem
                value="7d"
                className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                7d
              </ToggleGroupItem>
              <ToggleGroupItem
                value="15d"
                className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                15d
              </ToggleGroupItem>
              <ToggleGroupItem
                value="30d"
                className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                30d
              </ToggleGroupItem>
              <ToggleGroupItem
                value="month"
                className="h-6 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                Mês
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Mini label="Passos totais" value={totalSteps.toLocaleString("pt-BR")} />
          <Mini label="Pontos cardio" value={String(totalCardio)} />
          <Mini label="Dias ativos" value={`${activeDays}/${data.length}`} />
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                interval={data.length > 15 ? Math.floor(data.length / 10) : 0}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ""}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="passos" name="Passos" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cardio" name="Cardio" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Média: <span className="font-medium text-foreground">{avgSteps.toLocaleString("pt-BR")}</span> passos/dia
        </p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
