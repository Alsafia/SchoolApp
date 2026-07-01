import { StrictMode } from "react";
import { Toaster } from "sonner"; // أضف هذا فوق
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

import "./styles.css";

//const router = getRouter();
const router = getRouter();

console.log("ROUTER:", router);

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />


    <Toaster
      position="top-center"
      toastOptions={{
        className: "custom-toast",
      }}
    />
  </StrictMode>
);