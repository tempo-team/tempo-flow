-- Async completion (callback) support + checkpoint-resume engine claim key.

ALTER TABLE "NodeRun" ADD COLUMN "mapIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NodeRun" ADD COLUMN "completionMode" TEXT NOT NULL DEFAULT 'sync';
ALTER TABLE "NodeRun" ADD COLUMN "callbackTokenHash" TEXT;
ALTER TABLE "NodeRun" ADD COLUMN "callbackDeadline" TIMESTAMP(3);
ALTER TABLE "NodeRun" ADD COLUMN "output" TEXT;

-- One NodeRun per (run, node, fan-out index): the claim that serializes execution.
CREATE UNIQUE INDEX "NodeRun_flowRunId_nodeId_mapIndex_key" ON "NodeRun"("flowRunId", "nodeId", "mapIndex");
CREATE UNIQUE INDEX "NodeRun_callbackTokenHash_key" ON "NodeRun"("callbackTokenHash");
CREATE INDEX "NodeRun_status_callbackDeadline_idx" ON "NodeRun"("status", "callbackDeadline");
