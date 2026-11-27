-- DropIndex
DROP INDEX "categories_name_key";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "name",
ADD COLUMN     "title" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "categories_title_key" ON "categories"("title");

