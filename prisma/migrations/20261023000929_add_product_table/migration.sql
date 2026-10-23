-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
