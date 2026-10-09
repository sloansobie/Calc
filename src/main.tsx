import { createRoot } from "react-dom/client";
import App from "./App";
import { CalculatorBoundary } from "./CalculatorBoundary";
import "mathlive/static.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <CalculatorBoundary>
    <App />
  </CalculatorBoundary>,
);
