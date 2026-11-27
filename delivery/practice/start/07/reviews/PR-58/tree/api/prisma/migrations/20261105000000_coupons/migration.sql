-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "coupon_code" TEXT,
ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "coupons" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "percent_off" INTEGER NOT NULL,
    "max_uses" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_code_fkey" FOREIGN KEY ("coupon_code") REFERENCES "coupons"("code") ON DELETE SET NULL ON UPDATE CASCADE;
