import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  exchangeCodeForToken,
  getRedirectUri,
} from "@/lib/google-fit/google-fit.server";

function htmlResponse(opts: {
  title: string;
  message: string;
  ok: boolean;
}) {
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

export const Route = createFileRoute("/api/public/google-fit-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return htmlResponse({
            title: "Conexão cancelada",
            message: `Google retornou: ${error}`,
            ok: false,
          });
        }
        if (!code || !state) {
          return htmlResponse({
            title: "Parâmetros inválidos",
            message: "Faltou o código ou o state na resposta do Google.",
            ok: false,
          });
        }

        // Validate state
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("oauth_states")
          .select("user_id, provider, created_at")
          .eq("state", state)
          .maybeSingle();

        if (stateErr || !stateRow || stateRow.provider !== "google_fit") {
          return htmlResponse({
            title: "Sessão expirada",
            message: "Não foi possível validar a sua sessão. Tente conectar novamente.",
            ok: false,
          });
        }

        // Cleanup state immediately (single use)
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);

        const origin = `${url.protocol}//${url.host}`;

        try {
          const token = await exchangeCodeForToken({ code, origin });
          const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

          // Upsert integration
          const { error: upErr } = await supabaseAdmin
            .from("integrations")
            .upsert(
              {
                user_id: stateRow.user_id,
                provider: "google_fit",
                access_token: token.access_token,
                refresh_token: token.refresh_token ?? null,
                token_expires_at: expiresAt,
                scope: token.scope,
              },
              { onConflict: "user_id,provider" }
            );
          if (upErr) throw new Error(upErr.message);

          // Suppress unused warning
          void getRedirectUri;

          return htmlResponse({
            title: "Google Fit conectado!",
            message: "Sua conta foi conectada com sucesso. Redirecionando…",
            ok: true,
          });
        } catch (e) {
          console.error("Google Fit callback error:", e);
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
