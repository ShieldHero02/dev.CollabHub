import type { PropsWithChildren } from "react";
import type { CurrentUserDto } from "@collabhub/shared-types";

export type AppView = "overview" | "participants" | "member";

const navItems: Array<{ key: AppView; label: string }> = [
  { key: "overview", label: "Общее" },
  { key: "participants", label: "Участники" }
];

type AppShellProps = PropsWithChildren<{
  activeView: AppView;
  currentUser: CurrentUserDto | null;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
}>;

export function AppShell({ activeView, children, currentUser, onLogout, onNavigate }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => onNavigate("overview")} type="button">
          <span className="brand-mark">CH</span>
          <span>
            <b>CollabHub</b>
            <small>v2 dev</small>
          </span>
        </button>
        <nav className="main-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <button
              className={activeView === item.key ? "active" : ""}
              key={item.key}
              onClick={() => onNavigate(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="account-chip">
          <span>{currentUser?.login ?? "нет сессии"}</span>
          <small>{currentUser?.role ?? "guest"}</small>
        </div>
        <button className="ghost-button sidebar-action" onClick={onLogout} type="button">
          Выйти
        </button>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
