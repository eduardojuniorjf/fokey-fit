import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

function Index() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setProfile(data as Profile | null);
      });
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <h1 className="text-4xl font-bold">Fokey Fit</h1>
      <p className="text-muted-foreground">Supabase conectado — auth e perfis prontos.</p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm">
            Olá, <span className="font-medium">{profile?.full_name ?? user.email}</span>
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              toast.success("Você saiu da conta.");
            }}
          >
            Sair
          </Button>
        </div>
      ) : (
        <Button onClick={() => navigate({ to: "/auth" })}>Entrar / Criar conta</Button>
      )}

      <Link to="/auth" className="text-xs text-muted-foreground hover:underline">
        Página de autenticação
      </Link>
    </div>
  );
}
