import { Component, Suspense, type ReactNode } from 'react';

export function ViewLoading() {
  return <div className="view-loading" role="status" aria-live="polite"><span className="view-loading-line" /><span className="view-loading-line" /><span>Cargando sección…</span></div>;
}

export class AsyncView extends Component<{ children: ReactNode; viewKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; viewKey: string }>) {
    if (previous.viewKey !== this.props.viewKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <section className="card" role="alert"><p>No pudimos abrir esta sección. Tus operaciones guardadas se conservan.</p><button type="button" onClick={() => window.location.reload()}>Volver a cargar</button></section>;
    return <Suspense fallback={<ViewLoading />}>{this.props.children}</Suspense>;
  }
}
