import { Injectable } from '@nestjs/common'
import {
	InitiativeStatus,
	InitiativeType,
	Prisma,
	PrismaClient
} from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class InitiativeRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	create(
		data: Prisma.CommunityInitiativeUncheckedCreateInput,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiative.create({
			data,
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}

	findById(id: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInitiative.findUnique({
			where: { id },
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}

	listByCommunity(
		payload: {
			communityId: string
			type?: InitiativeType
			status?: InitiativeStatus
		},
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiative.findMany({
			where: {
				communityId: payload.communityId,
				...(payload.type && { type: payload.type }),
				...(payload.status && { status: payload.status })
			},
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			},
			orderBy: { createdAt: 'desc' }
		})
	}

	markSettling(id: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInitiative.update({
			where: { id },
			data: { status: 'SETTLING' },
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}

	markSucceeded(
		id: string,
		settlementOutcome: Prisma.CommunityInitiativeUpdateInput['settlementOutcome'],
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiative.update({
			where: { id },
			data: {
				status: 'SUCCEEDED',
				settlementOutcome
			},
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}

	markFailed(
		id: string,
		settlementOutcome: Prisma.CommunityInitiativeUpdateInput['settlementOutcome'],
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiative.update({
			where: { id },
			data: {
				status: 'FAILED',
				settlementOutcome
			},
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}

	markCanceled(id: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInitiative.update({
			where: { id },
			data: {
				status: 'CANCELED',
				settlementOutcome: 'CANCELED'
			},
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}

	incrementCollected(
		id: string,
		collectedAmountMinorDelta: bigint,
		collectedUnitsDelta: number,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiative.update({
			where: { id },
			data: {
				collectedAmountMinor: { increment: collectedAmountMinorDelta },
				collectedUnits: { increment: collectedUnitsDelta }
			},
			include: {
				wholesaleTiers: {
					orderBy: { minUnits: 'asc' }
				}
			}
		})
	}
}
