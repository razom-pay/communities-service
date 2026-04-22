import { Injectable } from '@nestjs/common'
import { CommunityRole, Prisma, PrismaClient } from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class CommunityMembershipRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	find(communityId: string, userId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityMembership.findUnique({
			where: {
				communityId_userId: {
					communityId,
					userId
				}
			}
		})
	}

	create(
		communityId: string,
		userId: string,
		role: CommunityRole,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityMembership.create({
			data: {
				communityId,
				userId,
				role
			}
		})
	}

	updateRole(
		communityId: string,
		userId: string,
		role: CommunityRole,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityMembership.update({
			where: {
				communityId_userId: {
					communityId,
					userId
				}
			},
			data: { role }
		})
	}

	delete(communityId: string, userId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityMembership.delete({
			where: {
				communityId_userId: {
					communityId,
					userId
				}
			}
		})
	}

	count(communityId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityMembership.count({
			where: { communityId }
		})
	}

	listByCommunity(communityId: string) {
		return this.prismaService.communityMembership.findMany({
			where: { communityId },
			orderBy: { createdAt: 'asc' }
		})
	}
}
