// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Prism } from "prism-react-renderer"

/**
 * prism-react-renderer vendors a Prism without a `bash` grammar, so shell/curl
 * snippets would render uncolored. Register a small bash grammar (enough for the
 * curl examples on the Integration page) on its Prism instance. Importing this
 * module for its side effect runs before the page highlights.
 */
const languages = Prism.languages as Record<string, unknown>
languages.bash ??= {
  comment: { pattern: /(^|\s)#.*/, lookbehind: true, greedy: true },
  string: [
    { pattern: /"(?:\\.|[^"\\])*"/, greedy: true },
    { pattern: /'(?:\\.|[^'\\])*'/, greedy: true },
  ],
  variable: /\$(?:\{[^}]*\}|\w+)/,
  function: {
    pattern: /(^|\s)(?:curl|echo|cat|export|source|bash|sh)(?=\s)/,
    lookbehind: true,
  },
  operator: /--?[\w-]+/,
  number: /\b\d+\b/,
}
