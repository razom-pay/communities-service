-- CreateEnum
CREATE TYPE "initiative_type" AS ENUM ('CROWDFUNDING', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "initiative_status" AS ENUM ('ACTIVE', 'SETTLING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "initiative_contribution_rule_type" AS ENUM ('ANY', 'MIN_ONLY', 'FIXED', 'RANGE');

-- CreateEnum
CREATE TYPE "initiative_contribution_status" AS ENUM ('HELD', 'CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "initiative_settlement_outcome" AS ENUM ('SUCCESS', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "community_initiatives" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "organizer_user_id" TEXT NOT NULL,
    "type" "initiative_type" NOT NULL,
    "status" "initiative_status" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "organizer_fee_minor" BIGINT NOT NULL,
    "goal_amount_minor" BIGINT,
    "crowdfunding_rule_type" "initiative_contribution_rule_type",
    "crowdfunding_min_amount_minor" BIGINT,
    "crowdfunding_fixed_amount_minor" BIGINT,
    "crowdfunding_max_amount_minor" BIGINT,
    "min_success_units" INTEGER,
    "max_units" INTEGER,
    "collected_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "collected_units" INTEGER NOT NULL DEFAULT 0,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "settlement_outcome" "initiative_settlement_outcome",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_initiatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_initiative_wholesale_tiers" (
    "id" TEXT NOT NULL,
    "initiative_id" TEXT NOT NULL,
    "min_units" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_initiative_wholesale_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_initiative_contributions" (
    "id" TEXT NOT NULL,
    "initiative_id" TEXT NOT NULL,
    "contributor_user_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "status" "initiative_contribution_status" NOT NULL DEFAULT 'HELD',
    "captured_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_initiative_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_initiative_settlements" (
    "id" TEXT NOT NULL,
    "initiative_id" TEXT NOT NULL,
    "outcome" "initiative_settlement_outcome" NOT NULL,
    "total_held_minor" BIGINT NOT NULL,
    "total_captured_minor" BIGINT NOT NULL,
    "total_refunded_minor" BIGINT NOT NULL,
    "final_unit_price_minor" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_initiative_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_initiatives_community_id_status_deadline_at_idx" ON "community_initiatives"("community_id", "status", "deadline_at");

-- CreateIndex
CREATE INDEX "community_initiatives_organizer_user_id_created_at_idx" ON "community_initiatives"("organizer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "community_initiative_wholesale_tiers_initiative_id_min_unit_idx" ON "community_initiative_wholesale_tiers"("initiative_id", "min_units");

-- CreateIndex
CREATE UNIQUE INDEX "community_initiative_wholesale_tiers_initiative_id_min_unit_key" ON "community_initiative_wholesale_tiers"("initiative_id", "min_units");

-- CreateIndex
CREATE INDEX "community_initiative_contributions_initiative_id_contributo_idx" ON "community_initiative_contributions"("initiative_id", "contributor_user_id");

-- CreateIndex
CREATE INDEX "community_initiative_contributions_initiative_id_created_at_idx" ON "community_initiative_contributions"("initiative_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "community_initiative_contributions_initiative_id_request_id_key" ON "community_initiative_contributions"("initiative_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_initiative_settlements_initiative_id_key" ON "community_initiative_settlements"("initiative_id");

-- AddForeignKey
ALTER TABLE "community_initiatives" ADD CONSTRAINT "community_initiatives_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_initiative_wholesale_tiers" ADD CONSTRAINT "community_initiative_wholesale_tiers_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "community_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_initiative_contributions" ADD CONSTRAINT "community_initiative_contributions_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "community_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_initiative_settlements" ADD CONSTRAINT "community_initiative_settlements_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "community_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

