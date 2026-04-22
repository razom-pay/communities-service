import { Injectable } from '@nestjs/common'
import {
	CommunityVisibility,
	Prisma,
	PrismaClient
} from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class CommunityRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	create(
		data: {
			description: string
			visibility: CommunityVisibility
			locationCountry?: string
			locationCity?: string
			locationStreet?: string
			locationHouse?: string
			avatar?: string
			cover?: string
			createdByUserId: string
		},
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).community.create({ data })
	}

	findById(id: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).community.findUnique({ where: { id } })
	}

	listByUserId(userId: string) {
		return this.prismaService.communityMembership.findMany({
			where: { userId },
			include: { community: true },
			orderBy: { createdAt: 'desc' }
		})
	}

	update(
		id: string,
		data: Prisma.CommunityUpdateInput,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).community.update({
			where: { id },
			data
		})
	}

	updateMembersCount(
		id: string,
		membersCount: number,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).community.update({
			where: { id },
			data: { membersCount }
		})
	}
}
