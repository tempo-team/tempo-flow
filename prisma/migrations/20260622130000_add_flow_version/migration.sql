-- CreateTable
CREATE TABLE "FlowVersion" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowVersion_flowId_version_key" ON "FlowVersion"("flowId", "version");

-- CreateIndex
CREATE INDEX "FlowVersion_flowId_idx" ON "FlowVersion"("flowId");

-- AddForeignKey
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
