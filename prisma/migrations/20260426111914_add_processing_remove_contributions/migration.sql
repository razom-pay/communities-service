/*
  Warnings:

  - You are about to drop the `initiative_contributions` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "initiative_status" ADD VALUE 'PROCESSING';

-- DropForeignKey
ALTER TABLE "initiative_contributions" DROP CONSTRAINT "initiative_contributions_initiative_id_fkey";

-- DropTable
DROP TABLE "initiative_contributions";

-- CreateIndex
CREATE INDEX "community_initiatives_status_deadline_idx" ON "community_initiatives"("status", "deadline");
