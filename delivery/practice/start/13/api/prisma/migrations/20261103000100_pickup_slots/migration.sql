-- CreateTable
CREATE TABLE "pickup_slots" (
    "slot_start" TIMESTAMPTZ(3) NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pickup_slots_pkey" PRIMARY KEY ("slot_start")
);
