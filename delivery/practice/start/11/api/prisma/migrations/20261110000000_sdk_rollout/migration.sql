-- CafePay SDK 2.0 分批上線：功能旗標表，與每筆付款是用哪一版 SDK 送出的
-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "feature_flags_percent_check" CHECK ("percent" BETWEEN 0 AND 100)
);

-- AlterTable：既有的付款都是 1.x 送出的
ALTER TABLE "payments" ADD COLUMN "sdk" TEXT NOT NULL DEFAULT 'v1';
