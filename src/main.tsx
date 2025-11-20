import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// KaTeX stylesheet for math rendering (install katex via npm first)
try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	require('katex/dist/katex.min.css');
} catch (e) {
	// ignore if katex isn't installed yet
}

createRoot(document.getElementById("root")!).render(<App />);
  