<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Reporting job results (async completion callbacks)

A node whose **completion** is `callback` only _triggers_ your job and then waits
(`WAITING_CALLBACK`) — its downstream nodes don't run until the job reports its
result back to the flow API. This frees the worker while long jobs run and
survives restarts. (In the editor: set a node's **Completion** to `callback`; or
in YAML, `completion: callback` with an optional `callbackTimeoutMs`.)

The same content is available in-app under the **Integration** menu.

## What your job receives

tempo-flow injects a one-time callback URL (the token is already in the URL) into
the triggered job. You just `POST` your result to it.

| Executor       | How the coordinates arrive                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **HTTP**       | headers `x-tempo-callback-url` / `x-tempo-callback-token` (body mode: `_tempoCallbackUrl` / `_tempoCallbackToken`) |
| **Script**     | env `TEMPO_CALLBACK_URL` / `TEMPO_CALLBACK_TOKEN`                                                                  |
| **Kubernetes** | env `TEMPO_CALLBACK_URL` / `TEMPO_CALLBACK_TOKEN`                                                                  |

## The contract

```
POST <callback-url>
Content-Type: application/json

{ "status": "success" | "failure", "output"?: object, "errorMessage"?: string }
→ 200 { "ok": true }
```

- `output` is surfaced to downstream params as `nodes.<id>.output`.
- The callback is **idempotent** — a duplicate or late report on an
  already-finished node is ignored.
- The token is one-time and expires at the node's callback timeout (default 30 min).

## Examples

### curl

```bash
# success
curl -X POST "$TEMPO_CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -d '{"status":"success","output":{"rows":42}}'

# failure
curl -X POST "$TEMPO_CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -d '{"status":"failure","errorMessage":"db timeout"}'
```

### Node.js

```js
const url = process.env.TEMPO_CALLBACK_URL

await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "success", output: { rows: 42 } }),
})
```

### Python

```python
import os, json, urllib.request

req = urllib.request.Request(
    os.environ["TEMPO_CALLBACK_URL"],
    data=json.dumps({"status": "success", "output": {"rows": 42}}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req)
```

### Go

```go
body, _ := json.Marshal(map[string]any{
    "status": "success",
    "output": map[string]int{"rows": 42},
})
http.Post(os.Getenv("TEMPO_CALLBACK_URL"), "application/json", bytes.NewReader(body))
```

### Java

```java
var body = "{\"status\":\"success\",\"output\":{\"rows\":42}}";
var req = HttpRequest.newBuilder(URI.create(System.getenv("TEMPO_CALLBACK_URL")))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.discarding());
```

## Long-running jobs

A callback node fails if no result arrives before its timeout. For long work,
extend the deadline with a heartbeat, and poll status if needed:

```bash
curl -X POST "$TEMPO_CALLBACK_URL/heartbeat"   # extend the deadline
curl "$TEMPO_CALLBACK_URL"                       # { "status": "..." }
```

> The callback base URL comes from `PUBLIC_URL` (see [configuration.md](./configuration.md)),
> so set it to an address your jobs can reach.
