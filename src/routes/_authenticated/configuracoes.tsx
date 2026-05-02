import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Smartphone, Monitor, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { DASHBOARD_CARDS, EMPTY_PREFS, type DashboardPrefs } from "@/lib/dashboardPrefs";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<DashboardPrefs>(EMPTY_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("dashboard_preferences")
      .select("mobile_hidden, desktop_hidden")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else if (data) setPrefs({
          mobile_hidden: data.mobile_hidden ?? [],
          desktop_hidden: data.desktop_hidden ?? [],
        });
        setLoading(false);
      });
  }, [user]);

  const toggle = (device: "mobile" | "desktop", id: string) => {
    setPrefs((p) => {
      const key = device === "mobile" ? "mobile_hidden" : "desktop_hidden";
      const list = p[key];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...p, [key]: next };
    });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("dashboard_preferences")
      .upsert(
        { user_id: user.id, mobile_hidden: prefs.mobile_hidden, desktop_hidden: prefs.desktop_hidden },
        { onConflict: "user_id" },
      );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Preferências salvas!");
  };

  const resetDevice = (device: "mobile" | "desktop") => {
    setPrefs((p) => ({ ...p, [device === "mobile" ? "mobile_hidden" : "desktop_hidden"]: [] }));
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 lg:max-w-[900px] lg:px-8 lg:pt-8">
      <header className="mb-5 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link to="/perfil"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Configurações</h1>
          <p className="text-xs text-muted-foreground">Personalize seu dashboard</p>
        </div>
      </header>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            Cards do dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Escolha quais cards aparecem em cada dispositivo. Ative para mostrar, desative para ocultar.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <DeviceColumn
            title="Mobile"
            icon={<Smartphone className="h-4 w-4 text-primary" />}
            hidden={prefs.mobile_hidden}
            onToggle={(id) => toggle("mobile", id)}
            onReset={() => resetDevice("mobile")}
          />
          <DeviceColumn
            title="Desktop"
            icon={<Monitor className="h-4 w-4 text-primary" />}
            hidden={prefs.desktop_hidden}
            onToggle={(id) => toggle("desktop", id)}
            onReset={() => resetDevice("desktop")}
          />
        </div>
      )}

      <div className="sticky bottom-20 mt-6 lg:bottom-6">
        <Button onClick={save} disabled={saving || loading} className="w-full" size="lg">
          {saving ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>
    </div>
  );
}

function DeviceColumn({
  title, icon, hidden, onToggle, onReset,
}: {
  title: string;
  icon: React.ReactNode;
  hidden: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const visibleCount = DASHBOARD_CARDS.length - hidden.length;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {visibleCount}/{DASHBOARD_CARDS.length}
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
          Mostrar todos
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {DASHBOARD_CARDS.map((card) => {
            const isVisible = !hidden.includes(card.id);
            return (
              <li
                key={card.id}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/50"
              >
                <span className="text-sm">{card.label}</span>
                <Switch checked={isVisible} onCheckedChange={() => onToggle(card.id)} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
