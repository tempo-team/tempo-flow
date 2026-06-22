-- Sub-flow support: link a run to its parent run (the run whose subflow node launched it).
ALTER TABLE "FlowRun" ADD COLUMN "parentRunId" TEXT;

CREATE INDEX "FlowRun_parentRunId_idx" ON "FlowRun"("parentRunId");
