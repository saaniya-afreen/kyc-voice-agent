import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, ListChecks, ShieldAlert, LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/worklist", label: "KYC Worklist", icon: ListChecks, end: false },
  { to: "/compliance", label: "Compliance Queue", icon: ShieldAlert, end: false },
];

export function Layout() {
  const { officer, setOfficer } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    setOfficer(null);
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight">KYC Compliance</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 truncate text-xs text-muted-foreground">{officer?.email}</div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
