import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", background: "#07060b", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20,
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
          <div style={{
            maxWidth: 420, width: "100%", textAlign: "center",
            background: "rgba(20,16,28,0.7)", border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: 20, padding: 32,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ color: "#f5f3fa", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
              Something went wrong
            </h2>
            <p style={{ color: "#8a8498", fontSize: 14, margin: "0 0 20px", lineHeight: 1.5 }}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => { this.setState({ hasError: false, error: null }); }}
                style={{
                  padding: "10px 24px", borderRadius: 10, border: "none",
                  background: "linear-gradient(135deg,#f97316,#ea580c)",
                  color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer",
                  boxShadow: "0 2px 12px rgba(249,115,22,0.25)",
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                style={{
                  padding: "10px 24px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#8a8498", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}