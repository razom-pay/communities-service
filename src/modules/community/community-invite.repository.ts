import { Injectable } from '@nestjs/common'
import {
	CommunityInviteStatus,
	Prisma,
	PrismaClient
} from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class CommunityInviteRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	create(
		communityId: string,
		invitedUserId: string,
		invitedByUserId: string,
		expiresAt: Date,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInvite.create({
			data: {
				communityId,
				invitedUserId,
				invitedByUserId,
				expiresAt,
				status: 'PENDING'
			}
		})
	}

	findById(id: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInvite.findUnique({ where: { id } })
	}

	cancelPending(
		communityId: string,
		invitedUserId: string,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInvite.updateMany({
			where: {
				communityId,
				invitedUserId,
				status: 'PENDING'
			},
			data: {
				status: 'CANCELED'
			}
		})
	}

	updateStatus(
		id: string,
		status: CommunityInviteStatus,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInvite.update({
			where: { id },
			data: { status }
		})
	}
}
