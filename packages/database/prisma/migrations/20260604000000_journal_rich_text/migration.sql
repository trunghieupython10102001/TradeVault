-- AlterTable: add period_type column to journal_entries
ALTER TABLE "journal_entries" ADD COLUMN "period_type" TEXT NOT NULL DEFAULT 'DAY';

-- DropIndex: remove old unique constraint
DROP INDEX "journal_entries_user_id_entry_date_key";

-- CreateTable: journal_trades
CREATE TABLE "journal_trades" (
    "journal_id" TEXT NOT NULL,
    "trade_id" TEXT NOT NULL,

    CONSTRAINT "journal_trades_pkey" PRIMARY KEY ("journal_id","trade_id")
);

-- CreateIndex: new unique constraint with period_type
CREATE UNIQUE INDEX "journal_entries_user_id_period_type_entry_date_key" ON "journal_entries"("user_id", "period_type", "entry_date");

-- AddForeignKey: journal_trades -> journal_entries
ALTER TABLE "journal_trades" ADD CONSTRAINT "journal_trades_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: journal_trades -> trades
ALTER TABLE "journal_trades" ADD CONSTRAINT "journal_trades_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
