-- CreateEnum
CREATE TYPE "initiative_type" AS ENUM ('CROWDFUNDING', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "initiative_status" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "community_initiatives" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "initiative_type" NOT NULL,
    "status" "initiative_status" NOT NULL DEFAULT 'ACTIVE',
    "deadline" TIMESTAMP(3) NOT NULL,
    "target_amount" INTEGER,
    "min_contribution" INTEGER,
    "max_contribution" INTEGER,
    "exact_contribution" INTEGER,
    "wholesale_max_quantity" INTEGER,
    "wholesale_tiers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_initiatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "initiative_contributions" (
    "id" TEXT NOT NULL,
    "initiative_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initiative_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_initiatives_community_id_status_idx" ON "community_initiatives"("community_id", "status");

-- CreateIndex
CREATE INDEX "initiative_contributions_initiative_id_user_id_idx" ON "initiative_contributions"("initiative_id", "user_id");

-- AddForeignKey
ALTER TABLE "community_initiatives" ADD CONSTRAINT "community_initiatives_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative_contributions" ADD CONSTRAINT "initiative_contributions_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "community_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
