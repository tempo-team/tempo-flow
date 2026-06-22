-- CreateTable
CREATE TABLE "FlowEventTrigger" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'redis',
    "topic" TEXT NOT NULL,
    "filterJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowEventTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlowEventTrigger_flowId_idx" ON "FlowEventTrigger"("flowId");

-- CreateIndex
CREATE INDEX "FlowEventTrigger_enabled_idx" ON "FlowEventTrigger"("enabled");

-- AddForeignKey
ALTER TABLE "FlowEventTrigger" ADD CONSTRAINT "FlowEventTrigger_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
