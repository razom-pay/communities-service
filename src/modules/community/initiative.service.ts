import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RpcException } from '@nestjs/microservices'
import {
	CommunityInitiative,
	CommunityInitiativeContribution,
	CommunityInitiativeSettlement,
	CommunityInitiativeWholesaleTier,
	InitiativeContributionRuleType as PrismaInitiativeContributionRuleType,
	InitiativeContributionStatus as PrismaInitiativeContributionStatus,
	InitiativeSettlementOutcome as PrismaInitiativeSettlementOutcome,
	InitiativeStatus as PrismaInitiativeStatus,
	InitiativeType as PrismaInitiativeType,
	Prisma
} from '@prisma/generated/client'
import { RpcStatus } from '@razom-pay/common'
import {
	ContributeToInitiativeRequest,
	CreateInitiativeRequest,
	FinalizeInitiativeRequest,
	GetInitiativeRequest,
	InitiativeContributionRuleType,
	InitiativeContributionStatus,
	InitiativeSettlementOutcome,
	InitiativeStatus,
	InitiativeType,
	ListCommunityInitiativesRequest,
	ListMyInitiativeContributionsRequest,
	type CancelInitiativeRequest
} from '@razom-pay/contracts/gen/community'
import { PinoLogger } from 'nestjs-pino'

import { PrismaService } from '@/infra/prisma/prisma.service'

import { CommunityBanRepository } from './community-ban.repository'
import { CommunityMembershipRepository } from './community-membership.repository'
import { CommunityRepository } from './community.repository'
import { InitiativeContributionRepository } from './initiative-contribution.repository'
import { InitiativeRepository } from './initiative.repository'
import { InitiativeSettlementRepository } from './initiative-settlement.repository'
import { InitiativeWholesaleTierRepository } from './initiative-wholesale-tier.repository'

type DbInitiative = CommunityInitiative & {
	wholesaleTiers: CommunityInitiativeWholesaleTier[]
}

const SERIALIZABLE_RETRY_LIMIT = 5

@Injectable()
export class InitiativeService {
	constructor(
		private readonly logger: PinoLogger,
		private readonly configService: ConfigService,
		private readonly prismaService: PrismaService,
		private readonly communityRepository: CommunityRepository,
		private readonly membershipRepository: CommunityMembershipRepository,
		private readonly banRepository: CommunityBanRepository,
		private readonly initiativeRepository: InitiativeRepository,
		private readonly initiativeWholesaleTierRepository: InitiativeWholesaleTierRepository,
		private readonly initiativeContributionRepository: InitiativeContributionRepository,
		private readonly initiativeSettlementRepository: InitiativeSettlementRepository
	) {
		this.logger.setContext(InitiativeService.name)
	}

	async createInitiative(data: CreateInitiativeRequest) {
		const payload = this.validateCreatePayload(data)

		const initiative = await this.prismaService.$transaction(async tx => {
			const community = await this.communityRepository.findById(
				data.communityId,
				tx
			)
			if (!community) this.notFound('Community not found')

			await this.assertMemberAndNotBanned(
				data.communityId,
				data.organizerUserId,
				tx
			)

			const created = await this.initiativeRepository.create(
				{
					communityId: data.communityId,
					organizerUserId: data.organizerUserId,
					type: payload.type,
					title: data.title.trim(),
					description: data.description.trim(),
					currency: 'UAH',
					organizerFeeMinor: payload.organizerFeeMinor,
					goalAmountMinor: payload.goalAmountMinor,
					crowdfundingRuleType: payload.crowdfundingRuleType,
					crowdfundingMinAmountMinor:
						payload.crowdfundingMinAmountMinor,
					crowdfundingFixedAmountMinor:
						payload.crowdfundingFixedAmountMinor,
					crowdfundingMaxAmountMinor:
						payload.crowdfundingMaxAmountMinor,
					minSuccessUnits: payload.minSuccessUnits,
					maxUnits: payload.maxUnits,
					deadlineAt: payload.deadlineAt
				},
				tx
			)

			if (payload.wholesaleTiers.length > 0) {
				await this.initiativeWholesaleTierRepository.createMany(
					created.id,
					payload.wholesaleTiers,
					tx
				)
			}

			const snapshot = await this.initiativeRepository.findById(
				created.id,
				tx
			)
			if (!snapshot) {
				this.fail(
					RpcStatus.INTERNAL,
					'Created initiative cannot be loaded'
				)
			}

			return snapshot
		})

		return {
			initiative: this.mapInitiative(initiative)
		}
	}

	async getInitiative(data: GetInitiativeRequest) {
		const initiative = await this.initiativeRepository.findById(data.initiativeId)
		if (!initiative || initiative.communityId !== data.communityId) {
			this.notFound('Initiative not found')
		}

		const settlement =
			await this.initiativeSettlementRepository.findByInitiative(
				initiative.id
			)

		return {
			initiative: this.mapInitiative(initiative),
			settlement: settlement ? this.mapSettlement(settlement) : undefined
		}
	}

	async listCommunityInitiatives(data: ListCommunityInitiativesRequest) {
		const community = await this.communityRepository.findById(data.communityId)
		if (!community) this.notFound('Community not found')

		await this.assertMemberAndNotBanned(
			data.communityId,
			data.requesterUserId
		)

		const type =
			data.type === undefined ||
			data.type === null ||
			data.type === InitiativeType.INITIATIVE_TYPE_UNSPECIFIED
				? undefined
				: this.toInitiativeType(data.type)

		const status =
			data.status === undefined ||
			data.status === null ||
			data.status === InitiativeStatus.INITIATIVE_STATUS_UNSPECIFIED
				? undefined
				: this.toInitiativeStatus(data.status)

		const initiatives = await this.initiativeRepository.listByCommunity({
			communityId: data.communityId,
			type,
			status
		})

		return {
			initiatives: initiatives.map(initiative => this.mapInitiative(initiative))
		}
	}

	async contributeToInitiative(data: ContributeToInitiativeRequest) {
		if (!data.requestId?.trim()) {
			this.fail(RpcStatus.INVALID_ARGUMENT, 'requestId is required')
		}

		const amountMinor = this.parseMinor(data.amountMinor, 'amountMinor', false)

		return this.runSerializable(async tx => {
			let initiative = await this.initiativeRepository.findById(
				data.initiativeId,
				tx
			)
			if (!initiative || initiative.communityId !== data.communityId) {
				this.notFound('Initiative not found')
			}

			await this.assertMemberAndNotBanned(
				data.communityId,
				data.contributorUserId,
				tx
			)

			if (initiative.status !== 'ACTIVE') {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Initiative is not active'
				)
			}

			if (initiative.deadlineAt.getTime() <= Date.now()) {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Initiative deadline has passed'
				)
			}

			const existing =
				await this.initiativeContributionRepository.findByInitiativeAndRequestId(
					initiative.id,
					data.requestId,
					tx
				)

			if (existing) {
				if (existing.contributorUserId !== data.contributorUserId) {
					this.fail(
						RpcStatus.ALREADY_EXISTS,
						'requestId already used in this initiative'
					)
				}

				return {
					initiative: this.mapInitiative(initiative),
					contribution: this.mapContribution(existing)
				}
			}

			const calculation =
				initiative.type === 'CROWDFUNDING'
					? this.calculateCrowdfundingContribution(initiative, amountMinor)
					: this.calculateWholesaleContribution(initiative, amountMinor)

			let contribution: CommunityInitiativeContribution
			try {
				contribution =
					await this.initiativeContributionRepository.createHeld(
						{
							initiativeId: initiative.id,
							contributorUserId: data.contributorUserId,
							requestId: data.requestId,
							amountMinor: calculation.amountMinor,
							units: calculation.units
						},
						tx
					)
			} catch (error) {
				if (this.isDuplicateRequestIdError(error)) {
					const duplicate =
						await this.initiativeContributionRepository.findByInitiativeAndRequestId(
							initiative.id,
							data.requestId,
							tx
						)
					if (duplicate) {
						initiative = await this.initiativeRepository.findById(
							initiative.id,
							tx
						)
						if (!initiative) this.notFound('Initiative not found')
						return {
							initiative: this.mapInitiative(initiative),
							contribution: this.mapContribution(duplicate)
						}
					}
				}
				throw error
			}

			initiative = await this.initiativeRepository.incrementCollected(
				initiative.id,
				calculation.amountMinor,
				calculation.units,
				tx
			)

			return {
				initiative: this.mapInitiative(initiative),
				contribution: this.mapContribution(contribution)
			}
		})
	}

	async listMyInitiativeContributions(data: ListMyInitiativeContributionsRequest) {
		const initiative = await this.initiativeRepository.findById(data.initiativeId)
		if (!initiative || initiative.communityId !== data.communityId) {
			this.notFound('Initiative not found')
		}

		await this.assertMemberAndNotBanned(data.communityId, data.userId)

		const contributions =
			await this.initiativeContributionRepository.listByInitiativeAndUser(
				initiative.id,
				data.userId
			)

		return {
			contributions: contributions.map(contribution =>
				this.mapContribution(contribution)
			)
		}
	}

	async cancelInitiative(data: CancelInitiativeRequest) {
		return this.runSerializable(async tx => {
			const result = await this.finalizeInTransaction(
				{
					communityId: data.communityId,
					initiativeId: data.initiativeId,
					actorUserId: data.actorUserId,
					mode: 'CANCEL',
					enforceDeadline: false
				},
				tx
			)

			return {
				initiative: this.mapInitiative(result.initiative),
				settlement: this.mapSettlement(result.settlement)
			}
		})
	}

	async finalizeInitiative(data: FinalizeInitiativeRequest) {
		return this.runSerializable(async tx => {
			const result = await this.finalizeInTransaction(
				{
					communityId: data.communityId,
					initiativeId: data.initiativeId,
					actorUserId: data.actorUserId,
					mode: 'FINALIZE',
					enforceDeadline: false
				},
				tx
			)

			return {
				initiative: this.mapInitiative(result.initiative),
				settlement: this.mapSettlement(result.settlement)
			}
		})
	}

	async finalizeExpiredBatch() {
		const parsedBatchSize = Number.parseInt(
			this.configService.get<string>('INITIATIVE_FINALIZE_BATCH_SIZE') ??
				'50',
			10
		)
		const batchSize =
			Number.isNaN(parsedBatchSize) || parsedBatchSize <= 0
				? 50
				: parsedBatchSize

		const expired = await this.prismaService.communityInitiative.findMany({
			where: {
				status: 'ACTIVE',
				deadlineAt: { lte: new Date() }
			},
			select: {
				id: true,
				communityId: true
			},
			orderBy: [{ deadlineAt: 'asc' }, { createdAt: 'asc' }],
			take: batchSize
		})

		for (const item of expired) {
			try {
				await this.runSerializable(async tx => {
					await this.finalizeInTransaction(
						{
							communityId: item.communityId,
							initiativeId: item.id,
							mode: 'FINALIZE',
							enforceDeadline: true
						},
						tx
					)
				})
			} catch (error) {
				this.logger.error(
					{
						err: error,
						initiativeId: item.id
					},
					'Failed to finalize expired initiative'
				)
			}
		}

		return expired.length
	}

	private validateCreatePayload(data: CreateInitiativeRequest) {
		if (!data.title?.trim()) {
			this.fail(RpcStatus.INVALID_ARGUMENT, 'title is required')
		}
		if (!data.description?.trim()) {
			this.fail(RpcStatus.INVALID_ARGUMENT, 'description is required')
		}
		if (data.currency !== 'UAH') {
			this.fail(RpcStatus.INVALID_ARGUMENT, 'Only UAH currency is supported')
		}

		const deadlineAt = new Date(data.deadlineAt)
		if (Number.isNaN(deadlineAt.getTime())) {
			this.fail(RpcStatus.INVALID_ARGUMENT, 'deadlineAt must be ISO date')
		}
		if (deadlineAt.getTime() <= Date.now()) {
			this.fail(RpcStatus.INVALID_ARGUMENT, 'deadlineAt must be in the future')
		}

		const organizerFeeMinor = this.parseMinor(
			data.organizerFeeMinor,
			'organizerFeeMinor'
		)
		const type = this.toInitiativeType(data.type)

		if (type === 'CROWDFUNDING') {
			const goalAmountMinor = this.parseMinor(
				data.goalAmountMinor,
				'goalAmountMinor',
				false
			)

			if (!data.crowdfundingRule) {
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					'crowdfundingRule is required for crowdfunding initiative'
				)
			}

			const ruleType = this.toContributionRuleType(
				data.crowdfundingRule.ruleType
			)

			let minAmountMinor: bigint | null = null
			let fixedAmountMinor: bigint | null = null
			let maxAmountMinor: bigint | null = null

			switch (ruleType) {
				case 'ANY':
					break
				case 'MIN_ONLY':
					minAmountMinor = this.parseMinor(
						data.crowdfundingRule.minAmountMinor,
						'crowdfundingRule.minAmountMinor',
						false
					)
					break
				case 'FIXED':
					fixedAmountMinor = this.parseMinor(
						data.crowdfundingRule.fixedAmountMinor,
						'crowdfundingRule.fixedAmountMinor',
						false
					)
					break
				case 'RANGE': {
					minAmountMinor = this.parseMinor(
						data.crowdfundingRule.minAmountMinor,
						'crowdfundingRule.minAmountMinor',
						false
					)
					maxAmountMinor = this.parseMinor(
						data.crowdfundingRule.maxAmountMinor,
						'crowdfundingRule.maxAmountMinor',
						false
					)
					if (maxAmountMinor < minAmountMinor) {
						this.fail(
							RpcStatus.INVALID_ARGUMENT,
							'crowdfundingRule.maxAmountMinor must be >= minAmountMinor'
						)
					}
					break
				}
				default:
					this.fail(
						RpcStatus.INVALID_ARGUMENT,
						'Unsupported crowdfunding contribution rule'
					)
			}

			const maxFee = (goalAmountMinor * 10n) / 100n
			if (organizerFeeMinor > maxFee) {
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					'organizerFeeMinor exceeds 10% crowdfunding limit'
				)
			}

			return {
				type,
				deadlineAt,
				organizerFeeMinor,
				goalAmountMinor,
				crowdfundingRuleType: ruleType,
				crowdfundingMinAmountMinor: minAmountMinor,
				crowdfundingFixedAmountMinor: fixedAmountMinor,
				crowdfundingMaxAmountMinor: maxAmountMinor,
				minSuccessUnits: null,
				maxUnits: null,
				wholesaleTiers: [] as Array<{
					minUnits: number
					unitPriceMinor: bigint
				}>
			}
		}

		if (!data.wholesaleRule) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'wholesaleRule is required for wholesale initiative'
			)
		}

		const minSuccessUnits = data.wholesaleRule.minSuccessUnits
		const maxUnits = data.wholesaleRule.maxUnits
		if (!Number.isInteger(minSuccessUnits) || minSuccessUnits <= 0) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'wholesaleRule.minSuccessUnits must be positive integer'
			)
		}
		if (!Number.isInteger(maxUnits) || maxUnits <= 0) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'wholesaleRule.maxUnits must be positive integer'
			)
		}
		if (maxUnits < minSuccessUnits) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'wholesaleRule.maxUnits must be >= minSuccessUnits'
			)
		}
		if (data.wholesaleRule.tiers.length === 0) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'wholesaleRule.tiers must contain at least one tier'
			)
		}

		const wholesaleTiers = data.wholesaleRule.tiers.map((tier, index) => {
			if (!Number.isInteger(tier.minUnits) || tier.minUnits <= 0) {
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					`wholesaleRule.tiers[${index}].minUnits must be positive integer`
				)
			}
			return {
				minUnits: tier.minUnits,
				unitPriceMinor: this.parseMinor(
					tier.unitPriceMinor,
					`wholesaleRule.tiers[${index}].unitPriceMinor`,
					false
				)
			}
		})

		for (let index = 1; index < wholesaleTiers.length; index += 1) {
			const previous = wholesaleTiers[index - 1]
			const current = wholesaleTiers[index]
			if (current.minUnits <= previous.minUnits) {
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					'wholesaleRule.tiers must be sorted by minUnits ascending with unique minUnits'
				)
			}
			if (current.unitPriceMinor > previous.unitPriceMinor) {
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					'wholesaleRule.tiers unitPriceMinor must be non-increasing'
				)
			}
		}

		const firstTierPrice = wholesaleTiers[0].unitPriceMinor
		const minSuccessOrderCostMinor = BigInt(minSuccessUnits) * firstTierPrice
		const maxFee = (minSuccessOrderCostMinor * 10n) / 100n
		if (organizerFeeMinor > maxFee) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'organizerFeeMinor exceeds 10% wholesale limit'
			)
		}

		return {
			type,
			deadlineAt,
			organizerFeeMinor,
			goalAmountMinor: null,
			crowdfundingRuleType: null,
			crowdfundingMinAmountMinor: null,
			crowdfundingFixedAmountMinor: null,
			crowdfundingMaxAmountMinor: null,
			minSuccessUnits,
			maxUnits,
			wholesaleTiers
		}
	}

	private async assertMemberAndNotBanned(
		communityId: string,
		userId: string,
		tx?: Prisma.TransactionClient
	) {
		const membership = await this.membershipRepository.find(
			communityId,
			userId,
			tx
		)
		if (!membership) {
			this.fail(
				RpcStatus.PERMISSION_DENIED,
				'User is not an active community member'
			)
		}

		const ban = await this.banRepository.find(communityId, userId, tx)
		if (ban && (!ban.expiresAt || ban.expiresAt.getTime() > Date.now())) {
			this.fail(RpcStatus.PERMISSION_DENIED, 'User is banned in community')
		}

		return membership
	}

	private calculateCrowdfundingContribution(
		initiative: DbInitiative,
		amountMinor: bigint
	) {
		const goalAmountMinor = initiative.goalAmountMinor
		if (goalAmountMinor === null) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Crowdfunding initiative has no goal amount'
			)
		}
		const ruleType = initiative.crowdfundingRuleType
		if (!ruleType) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Crowdfunding initiative has no contribution rule'
			)
		}

		const targetAmountMinor = goalAmountMinor + initiative.organizerFeeMinor
		const remainingAmountMinor =
			targetAmountMinor - initiative.collectedAmountMinor
		if (remainingAmountMinor <= 0n) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Crowdfunding target already reached'
			)
		}
		if (amountMinor > remainingAmountMinor) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'Contribution exceeds crowdfunding target remainder'
			)
		}

		switch (ruleType) {
			case 'ANY':
				break
			case 'MIN_ONLY': {
				const minimum = initiative.crowdfundingMinAmountMinor
				if (minimum === null) {
					this.fail(
						RpcStatus.FAILED_PRECONDITION,
						'Crowdfunding minimum amount is not configured'
					)
				}
				if (remainingAmountMinor < minimum) {
					if (amountMinor !== remainingAmountMinor) {
						this.fail(
							RpcStatus.INVALID_ARGUMENT,
							'Last contribution must equal crowdfunding remainder'
						)
					}
				} else if (amountMinor < minimum) {
					this.fail(
						RpcStatus.INVALID_ARGUMENT,
						'Contribution is below crowdfunding minimum amount'
					)
				}
				break
			}
			case 'FIXED': {
				const fixed = initiative.crowdfundingFixedAmountMinor
				if (fixed === null) {
					this.fail(
						RpcStatus.FAILED_PRECONDITION,
						'Crowdfunding fixed amount is not configured'
					)
				}
				if (remainingAmountMinor < fixed) {
					if (amountMinor !== remainingAmountMinor) {
						this.fail(
							RpcStatus.INVALID_ARGUMENT,
							'Last contribution must equal crowdfunding remainder'
						)
					}
				} else if (amountMinor !== fixed) {
					this.fail(
						RpcStatus.INVALID_ARGUMENT,
						'Contribution must equal fixed crowdfunding amount'
					)
				}
				break
			}
			case 'RANGE': {
				const minimum = initiative.crowdfundingMinAmountMinor
				const maximum = initiative.crowdfundingMaxAmountMinor
				if (minimum === null || maximum === null) {
					this.fail(
						RpcStatus.FAILED_PRECONDITION,
						'Crowdfunding range is not configured'
					)
				}
				if (remainingAmountMinor < minimum) {
					if (amountMinor !== remainingAmountMinor) {
						this.fail(
							RpcStatus.INVALID_ARGUMENT,
							'Last contribution must equal crowdfunding remainder'
						)
					}
				} else if (amountMinor < minimum || amountMinor > maximum) {
					this.fail(
						RpcStatus.INVALID_ARGUMENT,
						'Contribution is outside configured crowdfunding range'
					)
				}
				break
			}
			default:
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Unknown crowdfunding contribution rule type'
				)
		}

		return {
			amountMinor,
			units: 0
		}
	}

	private calculateWholesaleContribution(
		initiative: DbInitiative,
		amountMinor: bigint
	) {
		if (initiative.maxUnits === null) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Wholesale initiative max units are not configured'
			)
		}

		const currentUnitPriceMinor = this.resolveWholesaleCurrentUnitPrice(
			initiative.collectedUnits,
			initiative.wholesaleTiers
		)
		if (amountMinor % currentUnitPriceMinor !== 0n) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'Contribution amount must be multiple of current wholesale unit price'
			)
		}

		const units = Number(amountMinor / currentUnitPriceMinor)
		if (!Number.isInteger(units) || units <= 0) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'Contribution amount must convert to positive whole units'
			)
		}

		const nextCollectedUnits = initiative.collectedUnits + units
		if (nextCollectedUnits > initiative.maxUnits) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				'Contribution exceeds wholesale max units'
			)
		}

		return {
			amountMinor,
			units
		}
	}

	private resolveWholesaleCurrentUnitPrice(
		collectedUnits: number,
		tiers: CommunityInitiativeWholesaleTier[]
	) {
		if (tiers.length === 0) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Wholesale tiers are not configured'
			)
		}

		let unitPriceMinor = tiers[0].unitPriceMinor
		for (const tier of tiers) {
			if (collectedUnits >= tier.minUnits) {
				unitPriceMinor = tier.unitPriceMinor
			}
		}

		return unitPriceMinor
	}

	private resolveWholesaleFinalUnitPrice(
		collectedUnits: number,
		tiers: CommunityInitiativeWholesaleTier[]
	) {
		if (tiers.length === 0) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Wholesale tiers are not configured'
			)
		}

		let unitPriceMinor = tiers[0].unitPriceMinor
		for (const tier of tiers) {
			if (collectedUnits >= tier.minUnits) {
				unitPriceMinor = tier.unitPriceMinor
			}
		}

		return unitPriceMinor
	}

	private async settleCrowdfunding(
		initiative: DbInitiative,
		tx: Prisma.TransactionClient
	) {
		const contributions =
			await this.initiativeContributionRepository.listByInitiative(
				initiative.id,
				tx
			)
		const totalHeldMinor = contributions.reduce(
			(accumulator, contribution) => accumulator + contribution.amountMinor,
			0n
		)

		const goalAmountMinor = initiative.goalAmountMinor
		if (goalAmountMinor === null) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Crowdfunding initiative has no goal amount'
			)
		}

		const targetAmountMinor = goalAmountMinor + initiative.organizerFeeMinor
		if (initiative.collectedAmountMinor < targetAmountMinor) {
			return this.refundAllContributions(
				initiative,
				contributions,
				'FAILED',
				totalHeldMinor,
				tx
			)
		}

		for (const contribution of contributions) {
			await this.initiativeContributionRepository.applySettlement(
				contribution.id,
				{
					capturedAmountMinor: contribution.amountMinor,
					refundedAmountMinor: 0n,
					status: 'CAPTURED'
				},
				tx
			)
		}

		const settlement = await this.initiativeSettlementRepository.create(
			{
				initiativeId: initiative.id,
				outcome: 'SUCCESS',
				totalHeldMinor,
				totalCapturedMinor: totalHeldMinor,
				totalRefundedMinor: 0n,
				finalUnitPriceMinor: null
			},
			tx
		)
		const updated = await this.initiativeRepository.markSucceeded(
			initiative.id,
			'SUCCESS',
			tx
		)

		return {
			initiative: updated,
			settlement
		}
	}

	private async settleWholesale(
		initiative: DbInitiative,
		tx: Prisma.TransactionClient
	) {
		const contributions =
			await this.initiativeContributionRepository.listByInitiative(
				initiative.id,
				tx
			)
		const totalHeldMinor = contributions.reduce(
			(accumulator, contribution) => accumulator + contribution.amountMinor,
			0n
		)

		const minSuccessUnits = initiative.minSuccessUnits
		if (minSuccessUnits === null || initiative.maxUnits === null) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Wholesale initiative units are not configured'
			)
		}

		if (initiative.collectedUnits < minSuccessUnits) {
			return this.refundAllContributions(
				initiative,
				contributions,
				'FAILED',
				totalHeldMinor,
				tx
			)
		}

		const finalUnitPriceMinor = this.resolveWholesaleFinalUnitPrice(
			initiative.collectedUnits,
			initiative.wholesaleTiers
		)
		const productTotalMinor =
			BigInt(initiative.collectedUnits) * finalUnitPriceMinor
		const requiredTotalMinor =
			productTotalMinor + initiative.organizerFeeMinor
		if (initiative.collectedAmountMinor < requiredTotalMinor) {
			return this.refundAllContributions(
				initiative,
				contributions,
				'FAILED',
				totalHeldMinor,
				tx
			)
		}

		const totalUnits = initiative.collectedUnits
		let allocatedFeeMinor = 0n
		let capturedTotalMinor = 0n
		let refundedTotalMinor = 0n

		for (let index = 0; index < contributions.length; index += 1) {
			const contribution = contributions[index]
			let feeShareMinor =
				(initiative.organizerFeeMinor * BigInt(contribution.units)) /
				BigInt(totalUnits)
			if (index === contributions.length - 1) {
				feeShareMinor += initiative.organizerFeeMinor - allocatedFeeMinor
			}
			allocatedFeeMinor += feeShareMinor

			const productShareMinor =
				BigInt(contribution.units) * finalUnitPriceMinor
			const captureMinor = productShareMinor + feeShareMinor
			if (captureMinor > contribution.amountMinor) {
				return this.refundAllContributions(
					initiative,
					contributions,
					'FAILED',
					totalHeldMinor,
					tx
				)
			}

			const refundMinor = contribution.amountMinor - captureMinor
			await this.initiativeContributionRepository.applySettlement(
				contribution.id,
				{
					capturedAmountMinor: captureMinor,
					refundedAmountMinor: refundMinor,
					status:
						refundMinor === 0n
							? 'CAPTURED'
							: 'PARTIALLY_REFUNDED'
				},
				tx
			)

			capturedTotalMinor += captureMinor
			refundedTotalMinor += refundMinor
		}

		const settlement = await this.initiativeSettlementRepository.create(
			{
				initiativeId: initiative.id,
				outcome: 'SUCCESS',
				totalHeldMinor,
				totalCapturedMinor: capturedTotalMinor,
				totalRefundedMinor: refundedTotalMinor,
				finalUnitPriceMinor
			},
			tx
		)
		const updated = await this.initiativeRepository.markSucceeded(
			initiative.id,
			'SUCCESS',
			tx
		)

		return {
			initiative: updated,
			settlement
		}
	}

	private parseMinor(
		value: string | undefined,
		field: string,
		allowZero = true
	) {
		if (!value || !/^[0-9]+$/.test(value)) {
			this.fail(
				RpcStatus.INVALID_ARGUMENT,
				`${field} must be integer string in minor units`
			)
		}

		const parsed = BigInt(value)
		if (!allowZero && parsed === 0n) {
			this.fail(RpcStatus.INVALID_ARGUMENT, `${field} must be > 0`)
		}

		return parsed
	}

	private formatMinor(value: bigint) {
		return value.toString()
	}

	private async finalizeInTransaction(
		payload: {
			communityId: string
			initiativeId: string
			actorUserId?: string
			mode: 'FINALIZE' | 'CANCEL'
			enforceDeadline: boolean
		},
		tx: Prisma.TransactionClient
	) {
		let initiative = await this.initiativeRepository.findById(
			payload.initiativeId,
			tx
		)
		if (!initiative || initiative.communityId !== payload.communityId) {
			this.notFound('Initiative not found')
		}

		if (payload.actorUserId) {
			await this.assertOrganizerOrOwner(initiative, payload.actorUserId, tx)
		}

		if (
			initiative.status === 'SUCCEEDED' ||
			initiative.status === 'FAILED' ||
			initiative.status === 'CANCELED'
		) {
			const settlement =
				await this.initiativeSettlementRepository.findByInitiative(
					initiative.id,
					tx
				)
			if (!settlement) {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Initiative already finalized without settlement record'
				)
			}
			return {
				initiative,
				settlement
			}
		}

		const existingSettlement =
			await this.initiativeSettlementRepository.findByInitiative(
				initiative.id,
				tx
			)
		if (existingSettlement) {
			return {
				initiative,
				settlement: existingSettlement
			}
		}

		if (payload.enforceDeadline && initiative.deadlineAt.getTime() > Date.now()) {
			this.fail(
				RpcStatus.FAILED_PRECONDITION,
				'Initiative deadline is not reached yet'
			)
		}

		if (initiative.status === 'ACTIVE') {
			initiative = await this.initiativeRepository.markSettling(
				initiative.id,
				tx
			)
		}

		const contributions =
			await this.initiativeContributionRepository.listByInitiative(
				initiative.id,
				tx
			)
		const totalHeldMinor = contributions.reduce(
			(accumulator, contribution) => accumulator + contribution.amountMinor,
			0n
		)

		if (payload.mode === 'CANCEL') {
			return this.refundAllContributions(
				initiative,
				contributions,
				'CANCELED',
				totalHeldMinor,
				tx
			)
		}

		if (initiative.type === 'CROWDFUNDING') {
			return this.settleCrowdfunding(initiative, tx)
		}

		return this.settleWholesale(initiative, tx)
	}

	private async refundAllContributions(
		initiative: DbInitiative,
		contributions: CommunityInitiativeContribution[],
		outcome: PrismaInitiativeSettlementOutcome,
		totalHeldMinor: bigint,
		tx: Prisma.TransactionClient
	) {
		for (const contribution of contributions) {
			await this.initiativeContributionRepository.applySettlement(
				contribution.id,
				{
					capturedAmountMinor: 0n,
					refundedAmountMinor: contribution.amountMinor,
					status: 'REFUNDED'
				},
				tx
			)
		}

		const settlement = await this.initiativeSettlementRepository.create(
			{
				initiativeId: initiative.id,
				outcome,
				totalHeldMinor,
				totalCapturedMinor: 0n,
				totalRefundedMinor: totalHeldMinor,
				finalUnitPriceMinor: null
			},
			tx
		)

		const updated =
			outcome === 'CANCELED'
				? await this.initiativeRepository.markCanceled(initiative.id, tx)
				: await this.initiativeRepository.markFailed(
						initiative.id,
						'FAILED',
						tx
					)

		return {
			initiative: updated,
			settlement
		}
	}

	private async assertOrganizerOrOwner(
		initiative: DbInitiative,
		actorUserId: string,
		tx: Prisma.TransactionClient
	) {
		if (initiative.organizerUserId === actorUserId) return

		const membership = await this.assertMemberAndNotBanned(
			initiative.communityId,
			actorUserId,
			tx
		)
		if (membership.role !== 'OWNER') {
			this.fail(
				RpcStatus.PERMISSION_DENIED,
				'Only organizer or community owner can perform this action'
			)
		}
	}

	private toInitiativeType(
		value: InitiativeType | string | number
	): PrismaInitiativeType {
		switch (value) {
			case 'INITIATIVE_TYPE_CROWDFUNDING':
			case 'CROWDFUNDING':
			case InitiativeType.INITIATIVE_TYPE_CROWDFUNDING:
				return 'CROWDFUNDING'
			case 'INITIATIVE_TYPE_WHOLESALE':
			case 'WHOLESALE':
			case InitiativeType.INITIATIVE_TYPE_WHOLESALE:
				return 'WHOLESALE'
			default:
				this.fail(RpcStatus.INVALID_ARGUMENT, 'Invalid initiative type')
		}
	}

	private toInitiativeStatus(
		value: InitiativeStatus | string | number
	): PrismaInitiativeStatus {
		switch (value) {
			case 'INITIATIVE_STATUS_ACTIVE':
			case 'ACTIVE':
			case InitiativeStatus.INITIATIVE_STATUS_ACTIVE:
				return 'ACTIVE'
			case 'INITIATIVE_STATUS_SETTLING':
			case 'SETTLING':
			case InitiativeStatus.INITIATIVE_STATUS_SETTLING:
				return 'SETTLING'
			case 'INITIATIVE_STATUS_SUCCEEDED':
			case 'SUCCEEDED':
			case InitiativeStatus.INITIATIVE_STATUS_SUCCEEDED:
				return 'SUCCEEDED'
			case 'INITIATIVE_STATUS_FAILED':
			case 'FAILED':
			case InitiativeStatus.INITIATIVE_STATUS_FAILED:
				return 'FAILED'
			case 'INITIATIVE_STATUS_CANCELED':
			case 'CANCELED':
			case InitiativeStatus.INITIATIVE_STATUS_CANCELED:
				return 'CANCELED'
			default:
				this.fail(RpcStatus.INVALID_ARGUMENT, 'Invalid initiative status')
		}
	}

	private toContributionRuleType(
		value: InitiativeContributionRuleType | string | number
	): PrismaInitiativeContributionRuleType {
		switch (value) {
			case 'INITIATIVE_CONTRIBUTION_RULE_TYPE_ANY':
			case 'ANY':
			case InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_ANY:
				return 'ANY'
			case 'INITIATIVE_CONTRIBUTION_RULE_TYPE_MIN_ONLY':
			case 'MIN_ONLY':
			case InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_MIN_ONLY:
				return 'MIN_ONLY'
			case 'INITIATIVE_CONTRIBUTION_RULE_TYPE_FIXED':
			case 'FIXED':
			case InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_FIXED:
				return 'FIXED'
			case 'INITIATIVE_CONTRIBUTION_RULE_TYPE_RANGE':
			case 'RANGE':
			case InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_RANGE:
				return 'RANGE'
			default:
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					'Invalid initiative contribution rule type'
				)
		}
	}

	private mapInitiativeType(value: PrismaInitiativeType) {
		if (value === 'WHOLESALE') {
			return InitiativeType.INITIATIVE_TYPE_WHOLESALE
		}
		return InitiativeType.INITIATIVE_TYPE_CROWDFUNDING
	}

	private mapInitiativeStatus(value: PrismaInitiativeStatus) {
		switch (value) {
			case 'SETTLING':
				return InitiativeStatus.INITIATIVE_STATUS_SETTLING
			case 'SUCCEEDED':
				return InitiativeStatus.INITIATIVE_STATUS_SUCCEEDED
			case 'FAILED':
				return InitiativeStatus.INITIATIVE_STATUS_FAILED
			case 'CANCELED':
				return InitiativeStatus.INITIATIVE_STATUS_CANCELED
			default:
				return InitiativeStatus.INITIATIVE_STATUS_ACTIVE
		}
	}

	private mapContributionRuleType(value: PrismaInitiativeContributionRuleType) {
		switch (value) {
			case 'MIN_ONLY':
				return InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_MIN_ONLY
			case 'FIXED':
				return InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_FIXED
			case 'RANGE':
				return InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_RANGE
			default:
				return InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_ANY
		}
	}

	private mapSettlementOutcome(value: PrismaInitiativeSettlementOutcome) {
		switch (value) {
			case 'FAILED':
				return InitiativeSettlementOutcome.INITIATIVE_SETTLEMENT_OUTCOME_FAILED
			case 'CANCELED':
				return InitiativeSettlementOutcome.INITIATIVE_SETTLEMENT_OUTCOME_CANCELED
			default:
				return InitiativeSettlementOutcome.INITIATIVE_SETTLEMENT_OUTCOME_SUCCESS
		}
	}

	private mapContributionStatus(value: PrismaInitiativeContributionStatus) {
		switch (value) {
			case 'CAPTURED':
				return InitiativeContributionStatus.INITIATIVE_CONTRIBUTION_STATUS_CAPTURED
			case 'REFUNDED':
				return InitiativeContributionStatus.INITIATIVE_CONTRIBUTION_STATUS_REFUNDED
			case 'PARTIALLY_REFUNDED':
				return InitiativeContributionStatus.INITIATIVE_CONTRIBUTION_STATUS_PARTIALLY_REFUNDED
			default:
				return InitiativeContributionStatus.INITIATIVE_CONTRIBUTION_STATUS_HELD
		}
	}

	private mapInitiative(initiative: DbInitiative) {
		const crowdfundingRule =
			initiative.crowdfundingRuleType === null
				? undefined
				: {
						ruleType: this.mapContributionRuleType(
							initiative.crowdfundingRuleType
						),
						minAmountMinor:
							initiative.crowdfundingMinAmountMinor === null
								? undefined
								: this.formatMinor(
										initiative.crowdfundingMinAmountMinor
									),
						fixedAmountMinor:
							initiative.crowdfundingFixedAmountMinor === null
								? undefined
								: this.formatMinor(
										initiative.crowdfundingFixedAmountMinor
									),
						maxAmountMinor:
							initiative.crowdfundingMaxAmountMinor === null
								? undefined
								: this.formatMinor(
										initiative.crowdfundingMaxAmountMinor
									)
					}

		const wholesaleRule =
			initiative.type !== 'WHOLESALE'
				? undefined
				: {
						minSuccessUnits: initiative.minSuccessUnits ?? 0,
						maxUnits: initiative.maxUnits ?? 0,
						tiers: initiative.wholesaleTiers.map(tier => ({
							minUnits: tier.minUnits,
							unitPriceMinor: this.formatMinor(tier.unitPriceMinor)
						}))
					}

		return {
			id: initiative.id,
			communityId: initiative.communityId,
			organizerUserId: initiative.organizerUserId,
			type: this.mapInitiativeType(initiative.type),
			status: this.mapInitiativeStatus(initiative.status),
			title: initiative.title,
			description: initiative.description,
			currency: initiative.currency,
			organizerFeeMinor: this.formatMinor(initiative.organizerFeeMinor),
			goalAmountMinor:
				initiative.goalAmountMinor === null
					? undefined
					: this.formatMinor(initiative.goalAmountMinor),
			collectedAmountMinor: this.formatMinor(initiative.collectedAmountMinor),
			collectedUnits: initiative.collectedUnits,
			deadlineAt: initiative.deadlineAt.toISOString(),
			crowdfundingRule,
			wholesaleRule,
			settlementOutcome:
				initiative.settlementOutcome === null
					? undefined
					: this.mapSettlementOutcome(initiative.settlementOutcome),
			createdAt: initiative.createdAt.toISOString(),
			updatedAt: initiative.updatedAt.toISOString()
		}
	}

	private mapContribution(contribution: CommunityInitiativeContribution) {
		return {
			id: contribution.id,
			initiativeId: contribution.initiativeId,
			contributorUserId: contribution.contributorUserId,
			requestId: contribution.requestId,
			amountMinor: this.formatMinor(contribution.amountMinor),
			units: contribution.units,
			status: this.mapContributionStatus(contribution.status),
			capturedAmountMinor: this.formatMinor(contribution.capturedAmountMinor),
			refundedAmountMinor: this.formatMinor(contribution.refundedAmountMinor),
			createdAt: contribution.createdAt.toISOString(),
			updatedAt: contribution.updatedAt.toISOString()
		}
	}

	private mapSettlement(settlement: CommunityInitiativeSettlement) {
		return {
			initiativeId: settlement.initiativeId,
			outcome: this.mapSettlementOutcome(settlement.outcome),
			totalHeldMinor: this.formatMinor(settlement.totalHeldMinor),
			totalCapturedMinor: this.formatMinor(settlement.totalCapturedMinor),
			totalRefundedMinor: this.formatMinor(settlement.totalRefundedMinor),
			finalUnitPriceMinor:
				settlement.finalUnitPriceMinor === null
					? undefined
					: this.formatMinor(settlement.finalUnitPriceMinor),
			createdAt: settlement.createdAt.toISOString()
		}
	}

	private async runSerializable<T>(
		callback: (tx: Prisma.TransactionClient) => Promise<T>
	): Promise<T> {
		for (
			let attempt = 1;
			attempt <= SERIALIZABLE_RETRY_LIMIT;
			attempt += 1
		) {
			try {
				return await this.prismaService.$transaction(
					transaction => callback(transaction),
					{
						isolationLevel: Prisma.TransactionIsolationLevel.Serializable
					}
				)
			} catch (error) {
				if (
					this.isSerializationConflict(error) &&
					attempt < SERIALIZABLE_RETRY_LIMIT
				) {
					this.logger.warn(
						{ attempt },
						'Serializable transaction conflict, retrying'
					)
					continue
				}
				throw error
			}
		}

		this.fail(
			RpcStatus.INTERNAL,
			'Failed to complete transaction after retries'
		)
	}

	private isSerializationConflict(error: unknown) {
		if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
			return false
		}

		if (error.code === 'P2034') {
			return true
		}

		const message = String(error.message ?? '')
		return message.toLowerCase().includes('could not serialize')
	}

	private isDuplicateRequestIdError(error: unknown) {
		if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
			return false
		}
		if (error.code !== 'P2002') {
			return false
		}

		const target = Array.isArray(error.meta?.target)
			? error.meta?.target
			: []
		return target.includes('initiative_id') && target.includes('request_id')
	}

	private fail(code: number, message: string): never {
		throw new RpcException({ code, message })
	}

	private notFound(message: string): never {
		this.fail(RpcStatus.NOT_FOUND, message)
	}
}
