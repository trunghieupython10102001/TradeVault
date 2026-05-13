-- AlterTable
ALTER TABLE "trades" ADD COLUMN "broker_ticket_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_broker_ticket" ON "trades"("user_id", "broker_ticket_id");
