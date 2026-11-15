import { createRoot } from "react-dom/client";

import { IslandProvider } from "@/lib/island";

import { Stage } from "./stage";

createRoot(document.getElementById("root") as HTMLElement).render(
  <IslandProvider>
    <Stage />
  </IslandProvider>,
);
