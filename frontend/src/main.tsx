import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { configureAmplify } from "./auth/configure";
import "./styles/tokens.css";
import "./styles/global.css";

configureAmplify();

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("アプリケーションの描画先が見つかりません。");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
