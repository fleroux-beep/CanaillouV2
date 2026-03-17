import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Une erreur est survenue</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {this.state.error?.message || "Erreur inattendue lors du chargement de la page."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-lg gradient-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl"
            >
              <RefreshCw className="h-4 w-4" />
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
