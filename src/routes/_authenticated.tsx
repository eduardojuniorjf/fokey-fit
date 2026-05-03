import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { AppSidebar } from "@/components/AppSidebar";
import { syncGoogleFit, getGoogleFitStatus } from "@/lib/google-fit/google-fit.functions";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const syncFn = useServerFn(syncGoogleFit);
  const statusFn = useServerFn(getGoogleFitStatus);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, navigate]);

  // Auto-sync Google Fit on entry (throttled to once per 5 min per user).
  useEffect(() => {
    if (!user) return;
    const key = `gf:lastAutoSync:${user.id}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 5 * 60_000) return;
    localStorage.setItem(key, String(Date.now()));
    (async () => {
      try {
        const s = await statusFn();
        if (!s?.connected) return;
        await syncFn({ data: { tzOffsetMinutes: -new Date().getTimezoneOffset() } });
        window.dispatchEvent(new CustomEvent("gf:synced"));
      } catch (e) {
        console.warn("Auto-sync Google Fit falhou:", e);
      }
    })();
  }, [user, syncFn, statusFn]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <main className="flex-1 pb-20 lg:pb-8">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
