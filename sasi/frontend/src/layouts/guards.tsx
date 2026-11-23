import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/auth-context";

export function BootScreen() {
  return (
    <div className="app-boot">
      <p className="wordmark">Saran</p>
    </div>
  );
}

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <BootScreen />;
  if (status !== "authenticated") {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export function RedirectIfAuthed() {
  const { status } = useAuth();
  if (status === "loading") return <BootScreen />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}
