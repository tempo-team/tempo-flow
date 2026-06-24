// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * How an external job reports its result back to the flow API (async completion
 * callback). Static docs — surfaces the contract a `completion: "callback"` node
 * relies on, the coordinates each executor injects, and per-language snippets.
 */

const LANGUAGES = [
  {
    id: "curl",
    label: "curl",
    code: `# success
curl -X POST "$TEMPO_CALLBACK_URL" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"success","output":{"rows":42}}'

# failure
curl -X POST "$TEMPO_CALLBACK_URL" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"failure","errorMessage":"db timeout"}'`,
  },
  {
    id: "node",
    label: "Node.js",
    code: `const url = process.env.TEMPO_CALLBACK_URL

await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "success", output: { rows: 42 } }),
})`,
  },
  {
    id: "python",
    label: "Python",
    code: `import os, json, urllib.request

req = urllib.request.Request(
    os.environ["TEMPO_CALLBACK_URL"],
    data=json.dumps({"status": "success", "output": {"rows": 42}}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req)`,
  },
  {
    id: "go",
    label: "Go",
    code: `body, _ := json.Marshal(map[string]any{
    "status": "success",
    "output": map[string]int{"rows": 42},
})
http.Post(os.Getenv("TEMPO_CALLBACK_URL"), "application/json", bytes.NewReader(body))`,
  },
  {
    id: "java",
    label: "Java",
    code: `var body = "{\\"status\\":\\"success\\",\\"output\\":{\\"rows\\":42}}";
var req = HttpRequest.newBuilder(URI.create(System.getenv("TEMPO_CALLBACK_URL")))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.discarding());`,
  },
] as const

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Copy failed")
    }
  }
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2"
        onClick={copy}
        aria-label="Copy"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </Button>
      <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

function Mono({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
}

export function IntegrationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integration</h1>
        <p className="text-sm text-muted-foreground">
          Report a job's result back to tempo-flow so downstream nodes run on the real signal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
          <CardDescription>Async completion callbacks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Set a node's <Mono>Completion</Mono> to <Mono>callback</Mono>. The node only{" "}
            <em>triggers</em> your job and then waits (<Mono>WAITING_CALLBACK</Mono>) — its
            successors don't run until your job POSTs back its result. This frees the worker while
            long jobs run and survives restarts.
          </p>
          <p>
            tempo-flow hands your job a one-time callback URL (the token is already in the URL).
            Just POST your result to it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What your job receives</CardTitle>
          <CardDescription>Injected automatically by the executor</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <span className="font-medium">HTTP</span>
            <span className="text-muted-foreground">
              headers <Mono>x-tempo-callback-url</Mono> / <Mono>x-tempo-callback-token</Mono>
              <br />
              (body mode: <Mono>_tempoCallbackUrl</Mono> / <Mono>_tempoCallbackToken</Mono>)
            </span>
            <span className="font-medium">Script</span>
            <span className="text-muted-foreground">
              env <Mono>TEMPO_CALLBACK_URL</Mono> / <Mono>TEMPO_CALLBACK_TOKEN</Mono>
            </span>
            <span className="font-medium">Kubernetes</span>
            <span className="text-muted-foreground">
              env <Mono>TEMPO_CALLBACK_URL</Mono> / <Mono>TEMPO_CALLBACK_TOKEN</Mono>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report the result</CardTitle>
          <CardDescription>
            <Mono>POST</Mono> the callback URL with{" "}
            <Mono>{'{ "status": "success" | "failure", "output"?, "errorMessage"? }'}</Mono>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="curl">
            <TabsList>
              {LANGUAGES.map((l) => (
                <TabsTrigger key={l.id} value={l.id}>
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {LANGUAGES.map((l) => (
              <TabsContent key={l.id} value={l.id}>
                <CodeBlock code={l.code} />
              </TabsContent>
            ))}
          </Tabs>
          <p className="mt-3 text-xs text-muted-foreground">
            <Mono>output</Mono> is surfaced to downstream params as{" "}
            <Mono>nodes.&lt;id&gt;.output</Mono>. The callback is idempotent — a duplicate or late
            report on an already-finished node is ignored.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Long-running jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A callback node fails if no result arrives before its timeout (set per node, default 30
            min). For long work, extend the deadline with a heartbeat:
          </p>
          <CodeBlock code={`curl -X POST "$TEMPO_CALLBACK_URL/heartbeat"`} />
          <p>
            Check status any time with <Mono>GET $TEMPO_CALLBACK_URL</Mono>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
