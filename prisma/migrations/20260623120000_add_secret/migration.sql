-- First-class secrets injected into node executions at run time.
CREATE TABLE "Secret" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'global',
  "flowId" TEXT NOT NULL DEFAULT '',
  "key" TEXT NOT NULL,
  "valueEnc" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Secret_scope_flowId_key_key" ON "Secret"("scope", "flowId", "key");
CREATE INDEX "Secret_scope_flowId_idx" ON "Secret"("scope", "flowId");
