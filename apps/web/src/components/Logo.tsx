// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Brand mark: an indigo rounded badge with a "tempo pulse" waveform (tempo + flow).
 * Inline SVG so it stays crisp at any size / DPI and adapts to the theme via the
 * --primary / --primary-foreground tokens.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="tempo-flow"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path
        d="M6 19h4l3-8 4 12 3-8h6"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
