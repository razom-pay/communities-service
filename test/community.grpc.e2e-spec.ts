import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'

import { InitiativeService } from '../src/modules/community/initiative.service'

jest.mock(
	'@/infra/prisma/prisma.service',
	() => ({
		PrismaService: class PrismaService {}
	}),
	{ virtual: true }
)

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
}, { virtual: true })

function createBaseInitiative(overrides: Record<string, unknown> = {}) {
	const now = new Date()
	return {
		id: 'initiative-1',
		communityId: 'community-1',
		organizerUserId: 'organizer-1',
		type: 'CROWDFUNDING',
		status: 'ACTIVE',
		title: 'Initiative',
		description: 'Description',
		currency: 'UAH',
		organizerFeeMinor: 100n,
		goalAmountMinor: 1000n,
		crowdfundingRuleType: 'ANY',
		crowdfundingMinAmountMinor: null,
		crowdfundingFixedAmountMinor: null,
		crowdfundingMaxAmountMinor: null,
		minSuccessUnits: null,
		maxUnits: null,
		collectedAmountMinor: 1100n,
		collectedUnits: 0,
		deadlineAt: new Date(now.getTime() - 1_000),
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
			userId: 'owner-1',
			role: 'OWNER'
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
			initiativeRepository,
			initiativeContributionRepository,
			initiativeSettlementRepository
		}
	}
}

describe('CommunityService gRPC (e2e)', () => {
	it('Crowdfunding success flow', async () => {
		const { service, mocks } = buildService()
		const initiative = createBaseInitiative()

		;(mocks.initiativeRepository.findById as jest.Mock).mockResolvedValue(
			initiative
		)
		;(mocks.initiativeRepository.markSettling as jest.Mock).mockResolvedValue({
			...initiative,
			status: 'SETTLING'
		})
		;(mocks.initiativeRepository.markSucceeded as jest.Mock).mockResolvedValue({
			...initiative,
			status: 'SUCCEEDED',
			settlementOutcome: 'SUCCESS'
		})
		;(mocks.initiativeContributionRepository.listByInitiative as jest.Mock).mockResolvedValue(
			[
				{
					id: 'contribution-1',
					initiativeId: 'initiative-1',
					contributorUserId: 'u-1',
					requestId: 'req-1',
					amountMinor: 600n,
					units: 0,
					status: 'HELD',
					capturedAmountMinor: 0n,
					refundedAmountMinor: 0n,
					createdAt: new Date(),
					updatedAt: new Date()
				},
				{
					id: 'contribution-2',
					initiativeId: 'initiative-1',
					contributorUserId: 'u-2',
					requestId: 'req-2',
					amountMinor: 500n,
					units: 0,
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
			totalHeldMinor: 1100n,
			totalCapturedMinor: 1100n,
			totalRefundedMinor: 0n,
			finalUnitPriceMinor: null,
			createdAt: new Date()
		})

		const result = await service.finalizeInitiative({
			communityId: 'community-1',
			initiativeId: 'initiative-1',
			actorUserId: 'organizer-1'
		})

		expect(result.settlement?.outcome).toBe(1)
		expect(
			mocks.initiativeContributionRepository.applySettlement
		).toHaveBeenCalledTimes(2)
	})

	it('Crowdfunding deadline failure and refund flow', async () => {
		const { service, mocks } = buildService()
		const initiative = createBaseInitiative({
			collectedAmountMinor: 500n
		})

		;(mocks.initiativeRepository.findById as jest.Mock).mockResolvedValue(
			initiative
		)
		;(mocks.initiativeRepository.markSettling as jest.Mock).mockResolvedValue({
			...initiative,
			status: 'SETTLING'
		})
		;(mocks.initiativeRepository.markFailed as jest.Mock).mockResolvedValue({
			...initiative,
			status: 'FAILED',
			settlementOutcome: 'FAILED'
		})
		;(mocks.initiativeContributionRepository.listByInitiative as jest.Mock).mockResolvedValue(
			[
				{
					id: 'contribution-1',
					initiativeId: 'initiative-1',
					contributorUserId: 'u-1',
					requestId: 'req-1',
					amountMinor: 500n,
					units: 0,
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
			outcome: 'FAILED',
			totalHeldMinor: 500n,
			totalCapturedMinor: 0n,
			totalRefundedMinor: 500n,
			finalUnitPriceMinor: null,
			createdAt: new Date()
		})

		const result = await service.finalizeInitiative({
			communityId: 'community-1',
			initiativeId: 'initiative-1',
			actorUserId: 'organizer-1'
		})

		expect(result.settlement?.outcome).toBe(2)
		expect(
			mocks.initiativeContributionRepository.applySettlement
		).toHaveBeenCalledWith(
			'contribution-1',
			expect.objectContaining({
				status: 'REFUNDED',
				capturedAmountMinor: 0n,
				refundedAmountMinor: 500n
			}),
			expect.any(Object)
		)
	})

	it('Wholesale 50/75/100 tier progression with final refund', async () => {
		const { service, mocks } = buildService()
		const initiative = createBaseInitiative({
			type: 'WHOLESALE',
			goalAmountMinor: null,
			crowdfundingRuleType: null,
			collectedUnits: 100,
			collectedAmountMinor: 30000n,
			minSuccessUnits: 50,
			maxUnits: 300,
			organizerFeeMinor: 1000n,
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
				},
				{
					id: 'tier-100',
					initiativeId: 'initiative-1',
					minUnits: 100,
					unitPriceMinor: 270n,
					createdAt: new Date()
				}
			]
		})

		;(mocks.initiativeRepository.findById as jest.Mock).mockResolvedValue(
			initiative
		)
		;(mocks.initiativeRepository.markSettling as jest.Mock).mockResolvedValue({
			...initiative,
			status: 'SETTLING'
		})
		;(mocks.initiativeRepository.markSucceeded as jest.Mock).mockResolvedValue({
			...initiative,
			status: 'SUCCEEDED',
			settlementOutcome: 'SUCCESS'
		})
		;(mocks.initiativeContributionRepository.listByInitiative as jest.Mock).mockResolvedValue(
			[
				{
					id: 'contribution-1',
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
					id: 'contribution-2',
					initiativeId: 'initiative-1',
					contributorUserId: 'u-2',
					requestId: 'req-2',
					amountMinor: 15000n,
					units: 50,
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
			totalHeldMinor: 30000n,
			totalCapturedMinor: 28000n,
			totalRefundedMinor: 2000n,
			finalUnitPriceMinor: 270n,
			createdAt: new Date()
		})

		const result = await service.finalizeInitiative({
			communityId: 'community-1',
			initiativeId: 'initiative-1',
			actorUserId: 'organizer-1'
		})

		expect(result.settlement?.outcome).toBe(1)
		expect(result.settlement?.totalRefundedMinor).toBe('2000')
	})
})
