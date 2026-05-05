import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { exchangeCodeForToken } from "@/lib/strava/strava.server";

function htmlResponse(opts: { title: string; message: string; ok: boolean }) {
  const color = opts.ok ? "#16a34a" : "#dc2626";
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${opts.title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,sans-serif;background:#1e3a5f;color:#fff;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:#fff;color:#1e3a5f;padding:32px;border-radius:16px;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{margin:0 0 12px;color:${color};font-size:22px}
p{margin:0 0 20px;line-height:1.5}
a{display:inline-block;background:#ff8c42;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600}
</style></head><body><div class="card">
<h1>${opts.title}</h1><p>${opts.message}</p>
<a href="/perfil">Voltar para o Perfil</a>
</div><script>setTimeout(()=>{window.location.href='/perfil'},2500)</script></body></html>`;
  return new Response(html, {
    status: opts.ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/strava-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const scope = url.searchParams.get("scope") ?? "";

        if (error) {
          return htmlResponse({ title: "Conexão cancelada", message: `Strava retornou: ${error}`, ok: false });
        }
        if (!code || !state) {
          return htmlResponse({ title: "Parâmetros inválidos", message: "Faltou o código ou o state.", ok: false });
        }

        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("oauth_states")
          .select("user_id, provider")
          .eq("state", state)
          .maybeSingle();

        if (stateErr || !stateRow || stateRow.provider !== "strava") {
          return htmlResponse({ title: "Sessão expirada", message: "Tente conectar novamente.", ok: false });
        }

        await supabaseAdmin.from("oauth_states").delete().eq("state", state);

        // Verify required scope
        if (!scope.includes("activity:read_all")) {
          return htmlResponse({
            title: "Permissões insuficientes",
            message: "Você precisa autorizar a leitura de todas as atividades.",
            ok: false,
          });
        }

        try {
          const token = await exchangeCodeForToken(code);
          const expiresAt = new Date(token.expires_at * 1000).toISOString();
          const { error: upErr } = await supabaseAdmin.from("integrations").upsert(
            {
              user_id: stateRow.user_id,
              provider: "strava",
              access_token: token.access_token,
              refresh_token: token.refresh_token,
              token_expires_at: expiresAt,
              scope,
              provider_user_id: token.athlete?.id ? String(token.athlete.id) : null,
              metadata: token.athlete ? { athlete: token.athlete } : {},
            },
            { onConflict: "user_id,provider" }
          );
          if (upErr) throw new Error(upErr.message);

          return htmlResponse({
            title: "Strava conectado!",
            message: "Sua conta foi conectada. Redirecionando…",
            ok: true,
          });
        } catch (e) {
          console.error("Strava callback error:", e);
          return htmlResponse({
            title: "Falha ao conectar",
            message: e instanceof Error ? e.message : "Erro desconhecido",
            ok: false,
          });
        }
      },
    },
  },
});
