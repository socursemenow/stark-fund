// ─────────────────────────────────────────────────────────
// src/main.jsx — Clean entry, no auth provider needed
// Cartridge handles its own popup/auth flow
// ─────────────────────────────────────────────────────────
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#14102c",
            color: "#e8e4ef",
            border: "1px solid rgba(249,115,22,0.15)",
            borderRadius: "12px",
            fontSize: "14px",
          },
        }}
      />
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);