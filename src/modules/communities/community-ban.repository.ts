import { Injectable } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class CommunityBanRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	find(communityId: string, userId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityBan.findUnique({
			where: {
				communityId_userId: {
					communityId,
					userId
				}
			}
		})
	}

	async upsert(
		communityId: string,
		userId: string,
		bannedByUserId: string,
		reason: string | null,
		expiresAt: Date | null,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityBan.upsert({
			where: {
				communityId_userId: {
					communityId,
					userId
				}
			},
			create: {
				communityId,
				userId,
				bannedByUserId,
				reason,
				expiresAt
			},
			update: {
				bannedByUserId,
				reason,
				expiresAt,
				createdAt: new Date()
			}
		})
	}

	delete(communityId: string, userId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityBan.delete({
			where: {
				communityId_userId: {
					communityId,
					userId
				}
			}
		})
	}
}
