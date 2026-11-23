import { NavLink, Outlet } from "react-router-dom";

import { LiveCallBanner } from "@/components/live-call-banner";

export function AppShell() {
  return (
    <div className="shell">
      <LiveCallBanner />
      <Outlet />
      <nav className="nav" aria-label="Primary">
        <NavLink to="/" end>
          People
        </NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/account">Account</NavLink>
      </nav>
    </div>
  );
}
