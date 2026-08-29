import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import i18n from "@/i18n";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { logger } from "@/shared/lib/logger";

interface RootErrorBoundaryState {
  error: Error | null;
}

// Last-resort safety net for render errors outside the router's own reach
// (ThemeController, MotionPreferenceGate, AuthGate/ProfileGate all render
// before or around <AppRouter/>, not inside it, so the router's
// defaultErrorComponent never sees them). Without this, such an error
// white-screens the whole app instead of showing a recoverable state.
export class RootErrorBoundary extends Component<PropsWithChildren, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`Unhandled render error: ${error.message}\n${info.componentStack}`);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <EmptyState
        className="min-h-screen"
        icon={AlertTriangle}
        title={i18n.t("errors.unexpectedTitle")}
        description={i18n.t("errors.unexpectedDescription")}
        action={
          <div className="space-y-3 text-center">
            <Button type="button" variant="outline" onClick={this.handleReload}>
              <RotateCcw className="mr-2 size-4" />
              {i18n.t("errors.reload")}
            </Button>
            <details className="max-w-xl text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer text-center">{i18n.t("errors.technicalDetails")}</summary>
              <p className="mt-2 break-words rounded-xl border border-border bg-card p-3 font-mono">
                {i18n.t("errors.technicalDetailsLogged")}
              </p>
            </details>
          </div>
        }
      />
    );
  }
}
