// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Brand mark. Renders the high-resolution icon (256px source) downscaled to the
 * requested size so it stays crisp on hi-DPI displays — the previous blur came
 * from using the 32px PNG at a smaller size, not from the icon itself.
 */
export function Logo({ className }: { className?: string }) {
  return <img src="/icon-256.png" alt="" className={className} draggable={false} />
}
