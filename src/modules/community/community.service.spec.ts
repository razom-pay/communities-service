import { RpcException } from '@nestjs/microservices'
import { PinoLogger } from 'nestjs-pino'

import { PrismaService } from '@/infra/prisma/prisma.service'

import { CommunityBanRepository } from './community-ban.repository'
import { CommunityInviteRepository } from './community-invite.repository'
import { CommunityMembershipRepository } from './community-membership.repository'
import { CommunityRepository } from './community.repository'
import { CommunityService } from './community.service'

jest.mock('@/infra/prisma/prisma.service', () => ({
	PrismaService: class PrismaService {}
}))

describe('CommunityService RBAC', () => {
	let service: CommunityService

	beforeEach(() => {
		service = new CommunityService(
			{ setContext: jest.fn(), info: jest.fn() } as unknown as PinoLogger,
			{} as PrismaService,
			{} as CommunityRepository,
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
