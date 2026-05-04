import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
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
  const userId = user?.id;

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, navigate]);

  // Auto-sync Google Fit on every entry/navigation into the authenticated area.
  // Runs in the background; dashboard listens to "gf:synced" to refresh.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const s = await getGoogleFitStatus();
        if (cancelled || !s?.connected) return;
        const tz = -new Date().getTimezoneOffset();
        const res = await syncGoogleFit({ data: { tzOffsetMinutes: tz } });
        console.log("[gf] auto-sync ok", res);
        if (!cancelled) window.dispatchEvent(new CustomEvent("gf:synced"));
      } catch (e) {
        console.warn("[gf] auto-sync falhou:", e);
      }
    };
    run();
    // Re-sync when tab becomes visible again (real-time-ish updates)
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

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
