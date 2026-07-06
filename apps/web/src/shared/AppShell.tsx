import type { PropsWithChildren } from "react";

const navItems = ["Общее", "Участники", "Ивенты", "Кабинет", "Админ"];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">CH</span>
          <span>
            <b>CollabHub</b>
            <small>v2 platform</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Основная навигация">
          {navItems.map((item, index) => (
            <a className={index === 0 ? "active" : ""} href="/" key={item}>
              {item}
            </a>
          ))}
        </nav>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}

