-- CreateTable
CREATE TABLE "FlowWebhook" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "secretEncrypted" TEXT,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowWebhook_tokenHash_key" ON "FlowWebhook"("tokenHash");

-- CreateIndex
CREATE INDEX "FlowWebhook_flowId_idx" ON "FlowWebhook"("flowId");

-- AddForeignKey
ALTER TABLE "FlowWebhook" ADD CONSTRAINT "FlowWebhook_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
