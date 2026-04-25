import { Injectable } from '@nestjs/common'
import {
	InitiativeContributionStatus,
	Prisma,
	PrismaClient
} from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class InitiativeContributionRepository {
	constructor(private readonly prismaService: PrismaService) {}

	private db(
		tx?: Prisma.TransactionClient
	): PrismaClient | Prisma.TransactionClient {
		return tx ?? this.prismaService
	}

	createHeld(
		data: {
			initiativeId: string
			contributorUserId: string
			requestId: string
			amountMinor: bigint
			units: number
		},
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiativeContribution.create({
			data: {
				initiativeId: data.initiativeId,
				contributorUserId: data.contributorUserId,
				requestId: data.requestId,
				amountMinor: data.amountMinor,
				units: data.units,
				status: 'HELD'
			}
		})
	}

	findByInitiativeAndRequestId(
		initiativeId: string,
		requestId: string,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiativeContribution.findUnique({
			where: {
				initiativeId_requestId: {
					initiativeId,
					requestId
				}
			}
		})
	}

	listByInitiative(initiativeId: string, tx?: Prisma.TransactionClient) {
		return this.db(tx).communityInitiativeContribution.findMany({
			where: { initiativeId },
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
		})
	}

	listByInitiativeAndUser(
		initiativeId: string,
		contributorUserId: string,
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiativeContribution.findMany({
			where: {
				initiativeId,
				contributorUserId
			},
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
		})
	}

	applySettlement(
		contributionId: string,
		data: {
			capturedAmountMinor: bigint
			refundedAmountMinor: bigint
			status: InitiativeContributionStatus
		},
		tx?: Prisma.TransactionClient
	) {
		return this.db(tx).communityInitiativeContribution.update({
			where: { id: contributionId },
			data: {
				capturedAmountMinor: data.capturedAmountMinor,
				refundedAmountMinor: data.refundedAmountMinor,
				status: data.status
			}
		})
	}
}
