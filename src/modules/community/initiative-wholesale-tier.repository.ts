import { Injectable } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class InitiativeWholesaleTierRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	createMany(
		initiativeId: string,
		tiers: Array<{
			minUnits: number
			unitPriceMinor: bigint
		}>,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiativeWholesaleTier.createMany({
			data: tiers.map(tier => ({
				initiativeId,
				minUnits: tier.minUnits,
				unitPriceMinor: tier.unitPriceMinor
			}))
		})
	}

	listByInitiative(initiativeId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInitiativeWholesaleTier.findMany({
			where: { initiativeId },
			orderBy: { minUnits: 'asc' }
		})
	}
}
