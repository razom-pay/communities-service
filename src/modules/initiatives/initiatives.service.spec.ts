import { RpcException } from '@nestjs/microservices'
import { Test, TestingModule } from '@nestjs/testing'
import { RpcStatus } from '@razom-pay/common'
import {
	InitiativeStatus,
	InitiativeType
} from '@razom-pay/contracts/gen/communities'
import 'reflect-metadata'

import { CommunityMembershipRepository } from '../communities/community-membership.repository'

import { InitiativesRepository } from './initiatives.repository'
import { InitiativesService } from './initiatives.service'

describe('InitiativesService', () => {
	let service: InitiativesService
	let initiativesRepository: jest.Mocked<InitiativesRepository>
	let membershipRepository: jest.Mocked<CommunityMembershipRepository>

	const mockDate = new Date('2030-01-01T00:00:00Z')

	beforeEach(async () => {
		initiativesRepository = {
			create: jest.fn(),
			findById: jest.fn(),
			listByCommunityId: jest.fn(),
			createContribution: jest.fn()
		} as any

		membershipRepository = {
			find: jest.fn()
		} as any

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				InitiativesService,
				{
					provide: InitiativesRepository,
					useValue: initiativesRepository
				},
				{
					provide: CommunityMembershipRepository,
					useValue: membershipRepository
				}
			]
		}).compile()

		service = module.get<InitiativesService>(InitiativesService)
		jest.useFakeTimers()
		jest.setSystemTime(new Date('2025-01-01T00:00:00Z'))
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	describe('createInitiative', () => {
		it('should create an initiative if user is a member', async () => {
			membershipRepository.find.mockResolvedValue({} as any)
			const mockCreated = {
				id: 'init-1',
				communityId: 'com-1',
				createdByUserId: 'user-1',
				title: 'Test',
				description: null,
				type: 'CROWDFUNDING',
				status: 'ACTIVE',
				deadline: mockDate,
				createdAt: new Date(),
				updatedAt: new Date()
			}
			initiativesRepository.create.mockResolvedValue(mockCreated as any)

			const req = {
				communityId: 'com-1',
				userId: 'user-1',
				title: 'Test',
				type: InitiativeType.INITIATIVE_TYPE_CROWDFUNDING,
				deadline: mockDate.toISOString()
			}

			const result = await service.createInitiative(req as any)
			expect(result.id).toBe('init-1')
			expect(initiativesRepository.create).toHaveBeenCalled()
		})

		it('should throw PERMISSION_DENIED if user is not a member', async () => {
			membershipRepository.find.mockResolvedValue(null)

			await expect(
				service.createInitiative({
					communityId: 'com-1',
					userId: 'u-1'
				} as any)
			).rejects.toThrow(RpcException)
		})
	})

	describe('contributeToInitiative', () => {
		it('should throw NOT_FOUND if initiative does not exist', async () => {
			initiativesRepository.findById.mockResolvedValue(null)
			await expect(
				service.contributeToInitiative({
					initiativeId: 'init-1',
					userId: 'u-1',
					amount: 100
				})
			).rejects.toThrow(
				new RpcException({
					code: RpcStatus.NOT_FOUND,
					message: 'Initiative not found'
				})
			)
		})

		it('should throw FAILED_PRECONDITION if initiative is not active', async () => {
			initiativesRepository.findById.mockResolvedValue({
				status: 'COMPLETED',
				communityId: 'com-1'
			} as any)
			membershipRepository.find.mockResolvedValue({} as any)

			await expect(
				service.contributeToInitiative({
					initiativeId: 'init-1',
					userId: 'u-1',
					amount: 100
				})
			).rejects.toThrow(
				new RpcException({
					code: RpcStatus.FAILED_PRECONDITION,
					message: 'Initiative is not active'
				})
			)
		})

		it('should throw FAILED_PRECONDITION if deadline has passed', async () => {
			initiativesRepository.findById.mockResolvedValue({
				status: 'ACTIVE',
				communityId: 'com-1',
				deadline: new Date('2024-01-01T00:00:00Z')
			} as any)
			membershipRepository.find.mockResolvedValue({} as any)

			await expect(
				service.contributeToInitiative({
					initiativeId: 'init-1',
					userId: 'u-1',
					amount: 100
				})
			).rejects.toThrow(
				new RpcException({
					code: RpcStatus.FAILED_PRECONDITION,
					message: 'Initiative deadline has passed'
				})
			)
		})

		it('should enforce minContribution for CROWDFUNDING', async () => {
			initiativesRepository.findById.mockResolvedValue({
				id: 'init-1',
				status: 'ACTIVE',
				communityId: 'com-1',
				deadline: mockDate,
				type: 'CROWDFUNDING',
				minContribution: 500
			} as any)
			membershipRepository.find.mockResolvedValue({} as any)

			await expect(
				service.contributeToInitiative({
					initiativeId: 'init-1',
					userId: 'u-1',
					amount: 100
				})
			).rejects.toThrow(
				new RpcException({
					code: RpcStatus.INVALID_ARGUMENT,
					message: 'Minimum contribution is 500'
				})
			)
		})

		it('should create contribution if all checks pass', async () => {
			initiativesRepository.findById.mockResolvedValue({
				id: 'init-1',
				status: 'ACTIVE',
				communityId: 'com-1',
				deadline: mockDate,
				type: 'CROWDFUNDING'
			} as any)
			membershipRepository.find.mockResolvedValue({} as any)

			const mockContrib = {
				id: 'contrib-1',
				initiativeId: 'init-1',
				userId: 'u-1',
				amount: 100,
				status: 'PENDING',
				createdAt: new Date(),
				updatedAt: new Date()
			}
			initiativesRepository.createContribution.mockResolvedValue(
				mockContrib as any
			)

			const result = await service.contributeToInitiative({
				initiativeId: 'init-1',
				userId: 'u-1',
				amount: 100
			})
			expect(result.id).toBe('contrib-1')
			expect(initiativesRepository.createContribution).toHaveBeenCalled()
		})
	})
})
