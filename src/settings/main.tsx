import { createRoot } from "react-dom/client";

import { Settings } from "./settings";
import "./settings.css";

createRoot(document.getElementById("root") as HTMLElement).render(<Settings />);
