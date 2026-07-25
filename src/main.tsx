import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { AuthRoot } from "@/features/auth/auth-root";
import "@/i18n";
import "@/styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthRoot>
      <App />
    </AuthRoot>
  </React.StrictMode>
);
