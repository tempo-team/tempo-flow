// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("#root element not found")
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
