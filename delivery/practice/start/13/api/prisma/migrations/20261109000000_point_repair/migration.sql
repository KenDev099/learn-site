-- CAFE-33 資料修復：補償紀錄的欄位（reversal_of 唯一：一筆最多被抵銷一次）與修復執行紀錄
-- AlterTable
ALTER TABLE "point_entries" ADD COLUMN     "reversal_of" INTEGER,
ADD COLUMN     "run_id" TEXT;

-- CreateTable
CREATE TABLE "data_repair_runs" (
    "run_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_id" INTEGER NOT NULL DEFAULT 0,
    "reversed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "data_repair_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "point_entries_reversal_of_key" ON "point_entries"("reversal_of");

-- AddForeignKey
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "point_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

