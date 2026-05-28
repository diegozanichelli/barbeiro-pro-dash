import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

const RELOAD_FLAG = "performance_barber_chunk_reload_attempted";

function isChunkLoadError(error: Error) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i.test(
    error.message,
  );
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Erro ao renderizar a aplicação:", error, errorInfo);

    if (isChunkLoadError(error) && sessionStorage.getItem(RELOAD_FLAG) !== "true") {
      sessionStorage.setItem(RELOAD_FLAG, "true");
      window.location.reload();
      return;
    }

    sessionStorage.removeItem(RELOAD_FLAG);
  }

  handleReload = () => {
    sessionStorage.removeItem(RELOAD_FLAG);
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const isLazyChunkError = isChunkLoadError(this.state.error);

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-4 shadow-card-custom">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">
              Não foi possível carregar a aplicação
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLazyChunkError
                ? "Uma atualização do sistema pode ter deixado arquivos antigos no navegador. Recarregue a página para baixar a versão mais recente."
                : "Encontramos um erro inesperado ao abrir esta tela. Tente recarregar; se continuar, entre em contato com o suporte."}
            </p>
          </div>
          <Button className="w-full" onClick={this.handleReload}>
            Recarregar aplicação
          </Button>
          {!isLazyChunkError && (
            <p className="break-words rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }
}
