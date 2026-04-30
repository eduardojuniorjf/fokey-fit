import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, Activity, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  startGoogleFitOAuth,
  getGoogleFitStatus,
  disconnectGoogleFit,
  syncGoogleFit,
} from "@/lib/google-fit/google-fit.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const startGoogleFitOAuthFn = useServerFn(startGoogleFitOAuth);
  const getGoogleFitStatusFn = useServerFn(getGoogleFitStatus);
  const disconnectGoogleFitFn = useServerFn(disconnectGoogleFit);
  const syncGoogleFitFn = useServerFn(syncGoogleFit);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gfStatus, setGfStatus] = useState<{ connected: boolean; lastSyncedAt: string | null } | null>(null);
  const [gfBusy, setGfBusy] = useState(false);

  const refreshGfStatus = async () => {
    try {
      const s = await getGoogleFitStatusFn();
      setGfStatus(s);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (user) refreshGfStatus();
  }, [user]);

  const handleConnectGoogleFit = async () => {
    setGfBusy(true);
    try {
      const result = await startGoogleFitOAuthFn();
      const url = result?.url;
      if (typeof url !== "string" || !url.startsWith("https://accounts.google.com/")) {
        throw new Error("Falha ao iniciar conexão com o Google Fit");
      }
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar conexão");
      setGfBusy(false);
    }
  };

  const handleSyncGoogleFit = async () => {
    setGfBusy(true);
    try {
      const r = await syncGoogleFitFn();
      toast.success(`Sincronizado! ${r.activityCount} dia(s) de atividade, ${r.weightCount} peso(s).`);
      await refreshGfStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setGfBusy(false);
    }
  };

  const handleDisconnectGoogleFit = async () => {
    if (!confirm("Desconectar o Google Fit?")) return;
    setGfBusy(true);
    try {
      await disconnectGoogleFitFn();
      toast.success("Google Fit desconectado");
      await refreshGfStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar");
    } finally {
      setGfBusy(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else if (data) {
          setDisplayName(data.display_name ?? "");
          setAvatarUrl(data.avatar_url);
          setBio(data.bio ?? "");
        }
        setLoading(false);
      });
  }, [user]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: displayName || null, bio: bio || null })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado!");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Você saiu da conta.");
    navigate({ to: "/auth" });
  };

  void displayName;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 lg:max-w-[900px] lg:px-8 lg:pt-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold lg:text-3xl">Perfil</h1>
      </header>

      <Card className="mb-4">
        <CardContent className="flex items-center gap-4 py-5">
          <Avatar className="h-16 w-16">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName || "avatar"} /> : null}
            <AvatarFallback className="bg-primary/15 text-primary"><UserIcon className="h-7 w-7" /></AvatarFallback>
          </Avatar>
          <div className="overflow-hidden">
            <p className="truncate font-semibold">{displayName || "Sem nome"}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados pessoais</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-20 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dn">Nome</Label>
                  <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Input id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Conte um pouco sobre você" />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Integrações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/15 p-2 text-primary">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Google Fit</p>
                  <p className="text-xs text-muted-foreground">
                    {gfStatus?.connected
                      ? gfStatus.lastSyncedAt
                        ? `Sincronizado em ${new Date(gfStatus.lastSyncedAt).toLocaleString("pt-BR")}`
                        : "Conectado — nunca sincronizado"
                      : "Importe passos, calorias, pontos cardio e peso"}
                  </p>
                </div>
              </div>
              {!gfStatus?.connected ? (
                <Button size="sm" onClick={handleConnectGoogleFit} disabled={gfBusy}>
                  {gfBusy ? "..." : "Conectar"}
                </Button>
              ) : null}
            </div>
            {gfStatus?.connected ? (
              <div className="flex gap-2">
                <Button size="sm" variant="default" className="flex-1" onClick={handleSyncGoogleFit} disabled={gfBusy}>
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${gfBusy ? "animate-spin" : ""}`} />
                  Sincronizar
                </Button>
                <Button size="sm" variant="outline" onClick={handleDisconnectGoogleFit} disabled={gfBusy}>
                  <Unplug className="mr-1.5 h-4 w-4" />
                  Desconectar
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" className="mt-6 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />Sair da conta
      </Button>
    </div>
  );
}
