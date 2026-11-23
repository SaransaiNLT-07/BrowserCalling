import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "@/components/error-boundary";
import { IncomingCall } from "@/components/incoming-call";
import { AuthProvider } from "@/context/auth-context";
import { RealtimeProvider } from "@/context/realtime-context";
import { AppShell } from "@/layouts/app-shell";
import { RedirectIfAuthed, RequireAuth } from "@/layouts/guards";
import { AccountPage } from "@/pages/account";
import { CallPage } from "@/pages/call";
import { HistoryPage } from "@/pages/history";
import { PeoplePage } from "@/pages/people";
import { RegisterPage } from "@/pages/register";
import { SignInPage } from "@/pages/sign-in";

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RealtimeProvider>
          <BrowserRouter>
            <IncomingCall />
            <Routes>
              <Route element={<RedirectIfAuthed />}>
                <Route path="/sign-in" element={<SignInPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<PeoplePage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/account" element={<AccountPage />} />
                </Route>
                <Route path="/call/:id" element={<CallPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RealtimeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
