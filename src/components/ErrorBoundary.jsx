import React from "react";

const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
const RELOAD_FLAG = "cashbox_chunk_reload";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (CHUNK_ERROR_RE.test(error?.message || "") && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background text-center px-6">
          <p className="text-foreground font-medium">Something went wrong loading this page.</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            A newer version of CashBox may have been deployed. Reloading usually fixes this.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem(RELOAD_FLAG);
              window.location.reload();
            }}
            className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
