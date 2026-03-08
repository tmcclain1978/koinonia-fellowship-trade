import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Initialize global error tracking & observability
import "./lib/observability";

createRoot(document.getElementById("root")!).render(<App />);
