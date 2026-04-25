import { RpcException } from '@nestjs/microservices'
import { PinoLogger } from 'nestjs-pino'

import { PrismaService } from '@/infra/prisma/prisma.service'

import { CommunitiesRepository } from './communities.repository'
import { CommunitiesService } from './communities.service'
import { CommunityBanRepository } from './community-ban.repository'
import { CommunityInviteRepository } from './community-invite.repository'
import { CommunityMembershipRepository } from './community-membership.repository'

jest.mock('@/infra/prisma/prisma.service', () => ({
	PrismaService: class PrismaService {}
}))

describe('CommunitiesService RBAC', () => {
	let service: CommunitiesService

	beforeEach(() => {
		service = new CommunitiesService(
			{ setContext: jest.fn(), info: jest.fn() } as unknown as PinoLogger,
			{} as PrismaService,
			{} as CommunitiesRepository,
			{} as CommunityMembershipRepository,
			{} as CommunityInviteRepository,
			{} as CommunityBanRepository
		)
	})


	it('owner can ban moderator', () => {
		expect(() =>
			(service as any).assertCanBan('OWNER', 'MODERATOR')
		).not.toThrow()
	})

	it('moderator cannot ban moderator', () => {
		expect(() =>
			(service as any).assertCanBan('MODERATOR', 'MODERATOR')
		).toThrow(RpcException)
	})

	it('member cannot ban anyone', () => {
		expect(() => (service as any).assertCanBan('MEMBER', 'MEMBER')).toThrow(
			RpcException
		)
	})
})
