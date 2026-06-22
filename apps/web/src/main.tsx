// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { App } from "./App"
import "./index.css"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("#root element not found")
}

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="tempo-flow.theme"
    >
      <App />
      <Toaster richColors closeButton />
    </ThemeProvider>
  </StrictMode>,
)
