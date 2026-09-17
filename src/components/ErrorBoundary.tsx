import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {this.props.title ?? 'Algo ha fallado al cargar el mapa'}
        </h2>
        <pre className="max-h-48 w-full max-w-md overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground whitespace-pre-wrap">
          {error.message}
          {info ? `\n${info}` : ''}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
        >
          Recargar
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
