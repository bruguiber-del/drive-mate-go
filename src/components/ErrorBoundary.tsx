import { Component, type ErrorInfo, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
  info: string | null;
  sent: boolean;
  sending: boolean;
}

// Antes, si la app se caía de verdad, la única forma de enterarse era que
// la persona afectada lo contara ella misma — ahora se puede avisar al
// admin en un toque, con el error de verdad adjunto (no hace falta que
// nadie lo copie ni lo describa a mano).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, sent: false, sending: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  handleNotifySupport = async () => {
    const { error, info } = this.state;
    if (!error || this.state.sending) return;
    this.setState({ sending: true });
    try {
      await supabase.functions.invoke('contact-support', {
        body: {
          message: `La app se ha caído con este error: ${error.message}`,
          context: info ? `Componente: ${info.slice(0, 300)}` : undefined,
        },
      });
      this.setState({ sent: true });
    } catch {
      // Sin esto no hay nada más que intentar desde aquí — si el propio
      // aviso de fallo falla al mandarse, no hay un plan C.
    } finally {
      this.setState({ sending: false });
    }
  };

  render() {
    const { error, info, sent, sending } = this.state;
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
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
          >
            Recargar
          </button>
          <button
            onClick={this.handleNotifySupport}
            disabled={sending || sent}
            className="rounded-full border border-border px-6 py-2 text-sm font-medium text-foreground disabled:opacity-60"
          >
            {sent ? 'Avisado' : sending ? 'Avisando...' : 'Avisar al soporte'}
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
