import { Injectable } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class InitiativeSettlementRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	create(
		data: Prisma.CommunityInitiativeSettlementUncheckedCreateInput,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiativeSettlement.create({ data })
	}

	findByInitiative(initiativeId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInitiativeSettlement.findUnique({
			where: { initiativeId }
		})
	}
}
