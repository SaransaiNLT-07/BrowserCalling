import { Component, type ErrorInfo, type ReactNode } from "react";

import { log } from "@/services/logger";

type Props = { children: ReactNode };
type State = { message: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "Something went wrong." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("unhandled ui error", { error, info });
  }

  render() {
    if (this.state.message) {
      return (
        <main className="page">
          <p className="kicker">Saran</p>
          <h1 className="title">The page failed to load</h1>
          <p className="error">{this.state.message}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
