"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="card-glass rounded-lg p-3 text-center">
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Widget error — click to retry
            </p>
            <button
              className="mt-1 text-[9px] text-[var(--color-neon-blue)] hover:underline"
              onClick={() => this.setState({ hasError: false })}
            >
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
