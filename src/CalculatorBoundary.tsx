import { Component, type ReactNode } from "react";
export class CalculatorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    window.dispatchEvent(
      new ErrorEvent("error", { message: error.message, error }),
    );
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-panel" role="alert">
        <h1>Let’s reopen your worksheet.</h1>
        <p>
          The calculator display encountered a problem. Your saved expressions
          are kept.
        </p>
        <button onClick={() => window.location.reload()}>
          Reload calculator
        </button>
      </main>
    );
  }
}
