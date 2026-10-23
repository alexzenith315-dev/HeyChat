import { Component } from 'react';

// Catches render crashes in a route so one broken component shows an error card
// with a reload button instead of a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reload = this.reload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('HeyChat render error:', error, info?.componentStack);
  }

  reload() {
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 w-full max-w-xl px-4">
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <p className="font-display text-lg font-semibold text-ink">Something went wrong</p>
          <p className="text-sm text-ink-muted">This page hit a problem. Reloading usually fixes it.</p>
          <button
            type="button"
            onClick={this.reload}
            className="focus-ring mt-1 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
