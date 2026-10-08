import { Component, Suspense, type ReactNode } from 'react';

// A failed feature chunk must leave browsing and other mounted chain cards usable.
class FeatureBoundary extends Component<{ label: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(cause: unknown) { return { error: cause instanceof Error ? cause.message : String(cause) }; }
  render() {
    if (this.state.error !== null) return <div className="asset-read-error" role="alert"><p>{this.props.label} is unavailable. Check your connection, then reload the page to load it again.</p><p className="muted">If you already submitted a transaction, check its original identifier before continuing. Reloading does not retry a transaction.</p><button onClick={() => window.location.reload()}>Reload page</button><details><summary>Interface diagnostics</summary><p>{this.state.error}</p></details></div>;
    return this.props.children;
  }
}

export function DeferredFeature({ label, children }: { label: string; children: ReactNode }) {
  return <FeatureBoundary label={label}><Suspense fallback={<p role="status">Loading {label.toLowerCase()}…</p>}>{children}</Suspense></FeatureBoundary>;
}
