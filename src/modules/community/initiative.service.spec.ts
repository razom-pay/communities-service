import { ConfigService } from '@nestjs/config'
import { RpcException } from '@nestjs/microservices'
import {
	CreateInitiativeRequest,
	InitiativeContributionRuleType,
	InitiativeType as ProtoInitiativeType
} from '@razom-pay/contracts/gen/community'
import { PinoLogger } from 'nestjs-pino'

import { InitiativeService } from './initiative.service'

jest.mock('@/infra/prisma/prisma.service', () => ({
	PrismaService: class PrismaService {}
}))

jest.mock('@prisma/generated/client', () => {
	class PrismaClientKnownRequestError extends Error {
		code: string
		meta?: Record<string, unknown>

		constructor(code: string, meta?: Record<string, unknown>) {
			super(code)
			this.code = code
			this.meta = meta
		}
	}

	return {
		Prisma: {
			TransactionIsolationLevel: {
				Serializable: 'Serializable'
			},
			PrismaClientKnownRequestError
		}
	}
})

function createBaseInitiative(overrides: Record<string, unknown> = {}) {
	const now = new Date()
	return {
		id: 'initiative-1',
		communityId: 'community-1',
		organizerUserId: 'user-organizer',
		type: 'CROWDFUNDING',
		status: 'ACTIVE',
		title: 'Initiative',
		description: 'Initiative description',
		currency: 'UAH',
		organizerFeeMinor: 0n,
		goalAmountMinor: 1000n,
		crowdfundingRuleType: 'ANY',
		crowdfundingMinAmountMinor: null,
		crowdfundingFixedAmountMinor: null,
		crowdfundingMaxAmountMinor: null,
		minSuccessUnits: null,
		maxUnits: null,
		collectedAmountMinor: 0n,
		collectedUnits: 0,
		deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
		settlementOutcome: null,
		createdAt: now,
		updatedAt: now,
		wholesaleTiers: [],
		...overrides
	}
}

function buildService() {
	const logger = {
		setContext: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		info: jest.fn()
	} as unknown as PinoLogger

	const configService = {
		get: jest.fn()
	} as unknown as ConfigService

	const prismaService = {
		$transaction: jest.fn(async (arg: unknown) => {
			if (typeof arg === 'function') {
				return await (arg as (tx: unknown) => Promise<unknown>)({})
			}
			return arg
		}),
		communityInitiative: {
			findMany: jest.fn().mockResolvedValue([])
		}
	} as any

	const communityRepository = {
		findById: jest.fn().mockResolvedValue({ id: 'community-1' })
	} as any

	const membershipRepository = {
		find: jest.fn().mockResolvedValue({
			communityId: 'community-1',
			userId: 'user-1',
			role: 'MEMBER'
		})
	} as any

	const banRepository = {
		find: jest.fn().mockResolvedValue(null)
	} as any

	const initiativeRepository = {
		create: jest.fn(),
		findById: jest.fn(),
		listByCommunity: jest.fn(),
		markSettling: jest.fn(),
		markSucceeded: jest.fn(),
		markFailed: jest.fn(),
		markCanceled: jest.fn(),
		incrementCollected: jest.fn()
	} as any

	const initiativeWholesaleTierRepository = {
		createMany: jest.fn(),
		listByInitiative: jest.fn()
	} as any

	const initiativeContributionRepository = {
		createHeld: jest.fn(),
		findByInitiativeAndRequestId: jest.fn(),
		listByInitiative: jest.fn(),
		listByInitiativeAndUser: jest.fn(),
		applySettlement: jest.fn()
	} as any

	const initiativeSettlementRepository = {
		create: jest.fn(),
		findByInitiative: jest.fn().mockResolvedValue(null)
	} as any

	const service = new InitiativeService(
		logger,
		configService,
		prismaService,
		communityRepository,
		membershipRepository,
		banRepository,
		initiativeRepository,
		initiativeWholesaleTierRepository,
		initiativeContributionRepository,
		initiativeSettlementRepository
	)

	return {
		service,
		mocks: {
			prismaService,
			initiativeRepository,
			initiativeContributionRepository,
			initiativeSettlementRepository
		}
	}
}

describe('InitiativeService', () => {
	it('fails validation when crowdfunding fee is above 10%', () => {
		const { service } = buildService()

		const request: CreateInitiativeRequest = {
			communityId: 'community-1',
			organizerUserId: 'user-organizer',
			type: ProtoInitiativeType.INITIATIVE_TYPE_CROWDFUNDING,
			title: 'Crowdfunding initiative',
			description: 'Description',
			deadlineAt: new Date(Date.now() + 60_000).toISOString(),
			organizerFeeMinor: '101',
			currency: 'UAH',
			goalAmountMinor: '1000',
			crowdfundingRule: {
				ruleType:
					InitiativeContributionRuleType.INITIATIVE_CONTRIBUTION_RULE_TYPE_ANY,
				minAmountMinor: undefined,
				fixedAmountMinor: undefined,
				maxAmountMinor: undefined
			},
			wholesaleRule: undefined
		}

		expect(() => (service as any).validateCreatePayload(request)).toThrow(
			RpcException
		)
	})

	it('allows last crowdfunding payment below min/fixed/range min when equals remaining', () => {
		const { service } = buildService()

		const minOnlyInitiative = createBaseInitiative({
			crowdfundingRuleType: 'MIN_ONLY',
			crowdfundingMinAmountMinor: 200n,
			goalAmountMinor: 1000n,
			organizerFeeMinor: 0n,
			collectedAmountMinor: 850n
		})
		expect(() =>
			(service as any).calculateCrowdfundingContribution(
				minOnlyInitiative,
				150n
			)
		).not.toThrow()

		const fixedInitiative = createBaseInitiative({
			crowdfundingRuleType: 'FIXED',
			crowdfundingFixedAmountMinor: 300n,
			goalAmountMinor: 1000n,
			organizerFeeMinor: 0n,
			collectedAmountMinor: 850n
		})
		expect(() =>
			(service as any).calculateCrowdfundingContribution(
				fixedInitiative,
				150n
			)
		).not.toThrow()

		const rangeInitiative = createBaseInitiative({
			crowdfundingRuleType: 'RANGE',
			crowdfundingMinAmountMinor: 200n,
			crowdfundingMaxAmountMinor: 500n,
			goalAmountMinor: 1000n,
			organizerFeeMinor: 0n,
			collectedAmountMinor: 850n
		})
		expect(() =>
			(service as any).calculateCrowdfundingContribution(
				rangeInitiative,
				150n
			)
		).not.toThrow()
	})

	it('rejects wholesale contribution amount not multiple of current tier price', () => {
		const { service } = buildService()

		const wholesaleInitiative = createBaseInitiative({
			type: 'WHOLESALE',
			maxUnits: 100,
			minSuccessUnits: 50,
			wholesaleTiers: [
				{
					id: 'tier-1',
					initiativeId: 'initiative-1',
					minUnits: 50,
					unitPriceMinor: 300n,
					createdAt: new Date()
				}
			]
		})

		expect(() =>
			(service as any).calculateWholesaleContribution(wholesaleInitiative, 301n)
		).toThrow(RpcException)
	})

	it('settles wholesale with partial refunds after final tier downgrade', async () => {
		const { service, mocks } = buildService()

		const wholesaleInitiative = createBaseInitiative({
			type: 'WHOLESALE',
			collectedUnits: 75,
			collectedAmountMinor: 22500n,
			organizerFeeMinor: 500n,
			minSuccessUnits: 50,
			maxUnits: 300,
			wholesaleTiers: [
				{
					id: 'tier-50',
					initiativeId: 'initiative-1',
					minUnits: 50,
					unitPriceMinor: 300n,
					createdAt: new Date()
				},
				{
					id: 'tier-75',
					initiativeId: 'initiative-1',
					minUnits: 75,
					unitPriceMinor: 280n,
					createdAt: new Date()
				}
			]
		})

		;(mocks.initiativeContributionRepository.listByInitiative as jest.Mock).mockResolvedValue(
			[
				{
					id: 'c-1',
					initiativeId: 'initiative-1',
					contributorUserId: 'u-1',
					requestId: 'req-1',
					amountMinor: 15000n,
					units: 50,
					status: 'HELD',
					capturedAmountMinor: 0n,
					refundedAmountMinor: 0n,
					createdAt: new Date(),
					updatedAt: new Date()
				},
				{
					id: 'c-2',
					initiativeId: 'initiative-1',
					contributorUserId: 'u-2',
					requestId: 'req-2',
					amountMinor: 7500n,
					units: 25,
					status: 'HELD',
					capturedAmountMinor: 0n,
					refundedAmountMinor: 0n,
					createdAt: new Date(),
					updatedAt: new Date()
				}
			]
		)
		;(mocks.initiativeSettlementRepository.create as jest.Mock).mockResolvedValue({
			initiativeId: 'initiative-1',
			outcome: 'SUCCESS',
			totalHeldMinor: 22500n,
			totalCapturedMinor: 21500n,
			totalRefundedMinor: 1000n,
			finalUnitPriceMinor: 280n,
			createdAt: new Date()
		})
		;(mocks.initiativeRepository.markSucceeded as jest.Mock).mockResolvedValue(
			createBaseInitiative({
				...wholesaleInitiative,
				status: 'SUCCEEDED',
				settlementOutcome: 'SUCCESS'
			})
		)

		await (service as any).settleWholesale(wholesaleInitiative, {})

		expect(
			mocks.initiativeContributionRepository.applySettlement
		).toHaveBeenCalledTimes(2)

		const settlementPayload = (
			mocks.initiativeSettlementRepository.create as jest.Mock
		).mock.calls[0][0] as {
			totalHeldMinor: bigint
			totalCapturedMinor: bigint
			totalRefundedMinor: bigint
			finalUnitPriceMinor: bigint
		}

		expect(settlementPayload.finalUnitPriceMinor).toBe(280n)
		expect(settlementPayload.totalRefundedMinor > 0n).toBe(true)
		expect(
			settlementPayload.totalCapturedMinor +
				settlementPayload.totalRefundedMinor
		).toBe(settlementPayload.totalHeldMinor)

		expect(
			mocks.initiativeContributionRepository.applySettlement
		).toHaveBeenNthCalledWith(
			1,
			'c-1',
			expect.objectContaining({ status: 'PARTIALLY_REFUNDED' }),
			expect.any(Object)
		)
	})

	it('returns idempotent response for duplicate requestId in same initiative', async () => {
		const { service, mocks } = buildService()

		const initiative = createBaseInitiative({
			id: 'initiative-1',
			communityId: 'community-1',
			organizerFeeMinor: 0n,
			goalAmountMinor: 1000n,
			crowdfundingRuleType: 'ANY',
			deadlineAt: new Date(Date.now() + 5 * 60 * 1000)
		})
		;(mocks.initiativeRepository.findById as jest.Mock).mockResolvedValue(
			initiative
		)
		;(mocks.initiativeContributionRepository.findByInitiativeAndRequestId as jest.Mock).mockResolvedValue(
			{
				id: 'contribution-1',
				initiativeId: 'initiative-1',
				contributorUserId: 'user-1',
				requestId: 'req-1',
				amountMinor: 100n,
				units: 0,
				status: 'HELD',
				capturedAmountMinor: 0n,
				refundedAmountMinor: 0n,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		)

		const result = await service.contributeToInitiative({
			communityId: 'community-1',
			initiativeId: 'initiative-1',
			contributorUserId: 'user-1',
			amountMinor: '100',
			requestId: 'req-1'
		})

		expect(result.contribution?.requestId).toBe('req-1')
		expect(
			mocks.initiativeContributionRepository.createHeld
		).not.toHaveBeenCalled()
		expect(mocks.initiativeRepository.incrementCollected).not.toHaveBeenCalled()
	})
})
