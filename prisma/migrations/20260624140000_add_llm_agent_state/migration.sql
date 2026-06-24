-- Durable agentic LLM loop state (Phase 5): persisted conversation so a
-- tool-using LLM node can suspend while tool sub-flows run and resume across
-- worker restarts.
CREATE TABLE "LlmAgentState" (
  "id" TEXT NOT NULL,
  "flowRunId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "mapIndex" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "turn" INTEGER NOT NULL DEFAULT 0,
  "messages" TEXT NOT NULL,
  "pendingTools" TEXT,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT,
  "system" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LlmAgentState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LlmAgentState_flowRunId_nodeId_mapIndex_key" ON "LlmAgentState"("flowRunId", "nodeId", "mapIndex");
CREATE INDEX "LlmAgentState_flowRunId_status_idx" ON "LlmAgentState"("flowRunId", "status");
