import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function extractReadableMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as {
      error?: string;
      operationType?: string;
      path?: string | null;
    };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('permission')) {
        return `Permission denied while trying to ${parsed.operationType || 'access'} ${parsed.path || 'cloud data'}. Make sure you are signed in with the proper account role.`;
      }
      return parsed.error;
    }
  } catch {
    // Plain error message
  }
  return error.message || 'An unexpected application error occurred.';
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: extractReadableMessage(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('QUESTLAB ErrorBoundary caught:', error, info);
  }

  handleRecover = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ql-cosmic-backdrop flex min-h-screen items-center justify-center px-4 py-12 text-[#F1F5F9]">
          <div className="ql-panel-accent w-full max-w-lg rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 text-amber-300">
              <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden="true" />
              <h1 className="font-display text-xl font-bold text-white">
                Navigation Telemetry Interrupted
              </h1>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{this.state.message}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={this.handleRecover}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#55D9F5] px-4 py-2 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="inline-flex min-h-[42px] items-center rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
              >
                Reload QUESTLAB
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
