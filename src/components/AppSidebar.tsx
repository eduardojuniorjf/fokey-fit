import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Activity, Scale, ListChecks, User, History, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import fokeyFitLogo from "@/assets/fokey-fit-logo.png";

const items = [
  { to: "/", label: "Início", icon: Home, exact: true },
  { to: "/atividade", label: "Atividade", icon: Activity, exact: false },
  { to: "/medidas", label: "Medidas", icon: Scale, exact: false },
  { to: "/habitos", label: "Hábitos", icon: ListChecks, exact: false },
  { to: "/historico", label: "Histórico", icon: History, exact: false },
  { to: "/perfil", label: "Perfil", icon: User, exact: false },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();

  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
      aria-label="Navegação lateral"
    >
      {/* Brand */}
      <div className="flex items-center justify-center px-5 py-5 border-b border-sidebar-border">
        <img src={fokeyFitLogo} alt="Fokey Fit" className="h-12 w-auto object-contain" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/12 text-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px]", isActive && "stroke-[2.5]")} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold">
            {(user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user?.email ?? "—"}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => signOut()}
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
