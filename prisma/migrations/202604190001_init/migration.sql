CREATE TYPE "community_visibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "community_role" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');
CREATE TYPE "community_invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED');

CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "visibility" "community_visibility" NOT NULL DEFAULT 'PUBLIC',
    "location_country" TEXT,
    "location_city" TEXT,
    "location_street" TEXT,
    "location_house" TEXT,
    "avatar" TEXT,
    "cover" TEXT,
    "members_count" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_memberships" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "community_role" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_invites" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "status" "community_invite_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_bans" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "banned_by_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_bans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_memberships_community_id_user_id_key" ON "community_memberships"("community_id", "user_id");
CREATE INDEX "community_memberships_user_id_idx" ON "community_memberships"("user_id");
CREATE INDEX "community_invites_community_id_invited_user_id_idx" ON "community_invites"("community_id", "invited_user_id");
CREATE INDEX "community_invites_status_expires_at_idx" ON "community_invites"("status", "expires_at");
CREATE UNIQUE INDEX "community_bans_community_id_user_id_key" ON "community_bans"("community_id", "user_id");
CREATE INDEX "community_bans_expires_at_idx" ON "community_bans"("expires_at");

ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
