-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('succeeded', 'failed');

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "payment_status" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_fixes" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_fixes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_checkpoints" (
    "name" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_checkpoints_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_fixes_order_id_kind_key" ON "reconciliation_fixes"("order_id", "kind");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
