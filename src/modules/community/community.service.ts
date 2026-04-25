import { Injectable } from '@nestjs/common'
import { RpcException } from '@nestjs/microservices'
import {
	CommunityInvite,
	CommunityInviteStatus,
	CommunityMembership,
	type Community as DbCommunity,
	Prisma,
	CommunityRole as PrismaCommunityRole,
	CommunityVisibility as PrismaCommunityVisibility
} from '@prisma/generated/client'
import { RpcStatus } from '@razom-pay/common'
import {
	type AcceptInviteRequest,
	type AssignRoleRequest,
	type BanMemberRequest,
	type CreateCommunityRequest,
	type DeclineInviteRequest,
	type GetCommunityRequest,
	type InviteMemberRequest,
	type JoinCommunityRequest,
	type LeaveCommunityRequest,
	type ListCommunityMembersRequest,
	type ListMyCommunitiesRequest,
	type PatchCommunityRequest,
	type CommunityInviteStatus as ProtoInviteStatus,
	type CommunityRole as ProtoRole,
	type CommunityVisibility as ProtoVisibility,
	type UnbanMemberRequest
} from '@razom-pay/contracts/gen/communities'
import { PinoLogger } from 'nestjs-pino'

import { PrismaService } from '@/infra/prisma/prisma.service'

import { CommunityBanRepository } from './community-ban.repository'
import { CommunityInviteRepository } from './community-invite.repository'
import { CommunityMembershipRepository } from './community-membership.repository'
import { CommunityRepository } from './community.repository'

const ROLE_RANK: Record<PrismaCommunityRole, number> = {
	MEMBER: 1,
	MODERATOR: 2,
	OWNER: 3
}

const PROTO_VISIBILITY_PUBLIC = 1 as ProtoVisibility
const PROTO_VISIBILITY_PRIVATE = 2 as ProtoVisibility

const PROTO_ROLE_MEMBER = 1 as ProtoRole
const PROTO_ROLE_MODERATOR = 2 as ProtoRole
const PROTO_ROLE_OWNER = 3 as ProtoRole

const PROTO_INVITE_STATUS_PENDING = 1 as ProtoInviteStatus
const PROTO_INVITE_STATUS_ACCEPTED = 2 as ProtoInviteStatus
const PROTO_INVITE_STATUS_DECLINED = 3 as ProtoInviteStatus
const PROTO_INVITE_STATUS_CANCELED = 4 as ProtoInviteStatus

@Injectable()
export class CommunityService {
	constructor(
		private readonly logger: PinoLogger,
		private readonly prismaService: PrismaService,
		private readonly communityRepository: CommunityRepository,
		private readonly membershipRepository: CommunityMembershipRepository,
		private readonly inviteRepository: CommunityInviteRepository,
		private readonly banRepository: CommunityBanRepository
	) {
		this.logger.setContext(CommunityService.name)
	}

	async createCommunity(data: CreateCommunityRequest) {
		this.logger.info(`CreateCommunity requested by userId=${data.userId}`)

		const community = await this.prismaService.$transaction(async tx => {
			const created = await this.communityRepository.create(
				{
					description: data.description,
					visibility: this.toVisibility(data.visibility),
					locationCountry: data.locationCountry,
					locationCity: data.locationCity,
					locationStreet: data.locationStreet,
					locationHouse: data.locationHouse,
					avatar: data.avatar,
					cover: data.cover,
					createdByUserId: data.userId
				},
				tx
			)

			await this.membershipRepository.create(
				created.id,
				data.userId,
				'OWNER',
				tx
			)

			return created
		})

		return {
			community: this.mapCommunity(community)
		}
	}

	async getCommunity(data: GetCommunityRequest) {
		const community = await this.communityRepository.findById(
			data.communityId
		)

		if (!community) this.notFound('Community not found')

		return {
			community: this.mapCommunity(community)
		}
	}

	async patchCommunity(data: PatchCommunityRequest) {
		const updated = await this.prismaService.$transaction(async tx => {
			const community = await this.communityRepository.findById(
				data.communityId,
				tx
			)
			if (!community) this.notFound('Community not found')

			const actor = await this.assertMembership(
				data.communityId,
				data.userId,
				tx
			)
			this.assertRoleAtLeast(actor.role, 'MODERATOR')

			const payload: Prisma.CommunityUpdateInput = {
				...(data.description !== undefined && {
					description: data.description
				}),
				...(data.visibility !== undefined && {
					visibility: this.toVisibility(data.visibility)
				}),
				...(data.locationCountry !== undefined && {
					locationCountry: data.locationCountry
				}),
				...(data.locationCity !== undefined && {
					locationCity: data.locationCity
				}),
				...(data.locationStreet !== undefined && {
					locationStreet: data.locationStreet
				}),
				...(data.locationHouse !== undefined && {
					locationHouse: data.locationHouse
				}),
				...(data.avatar !== undefined && {
					avatar: data.avatar
				}),
				...(data.cover !== undefined && {
					cover: data.cover
				})
			}

			return this.communityRepository.update(
				data.communityId,
				payload,
				tx
			)
		})

		return {
			community: this.mapCommunity(updated)
		}
	}

	async listMyCommunities(data: ListMyCommunitiesRequest) {
		const memberships = await this.communityRepository.listByUserId(
			data.userId
		)

		return {
			communities: memberships.map(membership =>
				this.mapCommunity(membership.community)
			)
		}
	}

	async joinCommunity(data: JoinCommunityRequest) {
		await this.prismaService.$transaction(async tx => {
			const community = await this.communityRepository.findById(
				data.communityId,
				tx
			)
			if (!community) this.notFound('Community not found')

			await this.assertNotBanned(data.communityId, data.userId, tx)

			const membership = await this.membershipRepository.find(
				data.communityId,
				data.userId,
				tx
			)
			if (membership)
				this.fail(
					RpcStatus.ALREADY_EXISTS,
					'User is already a community member'
				)

			if (community.visibility === 'PRIVATE') {
				this.fail(
					RpcStatus.PERMISSION_DENIED,
					'Private community can be joined only by invite'
				)
			}

			await this.membershipRepository.create(
				data.communityId,
				data.userId,
				'MEMBER',
				tx
			)
			await this.syncMembersCount(data.communityId, tx)
		})

		return { ok: true }
	}

	async leaveCommunity(data: LeaveCommunityRequest) {
		await this.prismaService.$transaction(async tx => {
			const membership = await this.assertMembership(
				data.communityId,
				data.userId,
				tx
			)

			if (membership.role === 'OWNER') {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Community owner cannot leave the community'
				)
			}

			await this.membershipRepository.delete(
				data.communityId,
				data.userId,
				tx
			)
			await this.syncMembersCount(data.communityId, tx)
		})

		return { ok: true }
	}

	async inviteMember(data: InviteMemberRequest) {
		const invite = await this.prismaService.$transaction(async tx => {
			const actor = await this.assertMembership(
				data.communityId,
				data.invitedByUserId,
				tx
			)
			this.assertRoleAtLeast(actor.role, 'MODERATOR')

			await this.assertNotBanned(data.communityId, data.invitedUserId, tx)
			const targetMembership = await this.membershipRepository.find(
				data.communityId,
				data.invitedUserId,
				tx
			)

			if (targetMembership)
				this.fail(RpcStatus.ALREADY_EXISTS, 'User is already a member')

			await this.inviteRepository.cancelPending(
				data.communityId,
				data.invitedUserId,
				tx
			)

			const expiresAt = data.expiresAt
				? new Date(data.expiresAt)
				: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

			return this.inviteRepository.create(
				data.communityId,
				data.invitedUserId,
				data.invitedByUserId,
				expiresAt,
				tx
			)
		})

		return {
			invite: this.mapInvite(invite)
		}
	}

	async acceptInvite(data: AcceptInviteRequest) {
		await this.prismaService.$transaction(async tx => {
			const invite = await this.inviteRepository.findById(
				data.inviteId,
				tx
			)
			if (!invite || invite.communityId !== data.communityId) {
				this.notFound('Invite not found')
			}

			if (invite.invitedUserId !== data.userId) {
				this.fail(
					RpcStatus.PERMISSION_DENIED,
					'Invite belongs to another user'
				)
			}

			if (invite.status !== 'PENDING') {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Invite is not pending'
				)
			}

			if (invite.expiresAt.getTime() <= Date.now()) {
				this.fail(RpcStatus.FAILED_PRECONDITION, 'Invite expired')
			}

			await this.assertNotBanned(data.communityId, data.userId, tx)
			const membership = await this.membershipRepository.find(
				data.communityId,
				data.userId,
				tx
			)
			if (membership)
				this.fail(RpcStatus.ALREADY_EXISTS, 'User is already a member')

			await this.inviteRepository.updateStatus(
				data.inviteId,
				'ACCEPTED',
				tx
			)
			await this.membershipRepository.create(
				data.communityId,
				data.userId,
				'MEMBER',
				tx
			)
			await this.syncMembersCount(data.communityId, tx)
		})

		return { ok: true }
	}

	async declineInvite(data: DeclineInviteRequest) {
		await this.prismaService.$transaction(async tx => {
			const invite = await this.inviteRepository.findById(
				data.inviteId,
				tx
			)
			if (!invite || invite.communityId !== data.communityId) {
				this.notFound('Invite not found')
			}

			if (invite.invitedUserId !== data.userId) {
				this.fail(
					RpcStatus.PERMISSION_DENIED,
					'Invite belongs to another user'
				)
			}

			if (invite.status !== 'PENDING') {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Invite is not pending'
				)
			}

			await this.inviteRepository.updateStatus(
				data.inviteId,
				'DECLINED',
				tx
			)
		})

		return { ok: true }
	}

	async assignRole(data: AssignRoleRequest) {
		await this.prismaService.$transaction(async tx => {
			const actor = await this.assertMembership(
				data.communityId,
				data.actorUserId,
				tx
			)
			if (actor.role !== 'OWNER') {
				this.fail(
					RpcStatus.PERMISSION_DENIED,
					'Only community owner can assign roles'
				)
			}

			const target = await this.assertMembership(
				data.communityId,
				data.targetUserId,
				tx
			)
			const targetRole = this.toRole(data.role)

			if (target.userId === data.actorUserId && targetRole !== 'OWNER') {
				this.fail(
					RpcStatus.FAILED_PRECONDITION,
					'Owner cannot demote self'
				)
			}

			await this.membershipRepository.updateRole(
				data.communityId,
				data.targetUserId,
				targetRole,
				tx
			)
		})

		return { ok: true }
	}

	async banMember(data: BanMemberRequest) {
		await this.prismaService.$transaction(async tx => {
			const actor = await this.assertMembership(
				data.communityId,
				data.actorUserId,
				tx
			)
			const target = await this.assertMembership(
				data.communityId,
				data.targetUserId,
				tx
			)

			if (data.actorUserId === data.targetUserId) {
				this.fail(RpcStatus.FAILED_PRECONDITION, 'Cannot ban self')
			}

			this.assertCanBan(actor.role, target.role)

			await this.banRepository.upsert(
				data.communityId,
				data.targetUserId,
				data.actorUserId,
				data.reason ?? null,
				data.expiresAt ? new Date(data.expiresAt) : null,
				tx
			)

			await this.membershipRepository.delete(
				data.communityId,
				data.targetUserId,
				tx
			)
			await this.syncMembersCount(data.communityId, tx)
		})

		return { ok: true }
	}

	async unbanMember(data: UnbanMemberRequest) {
		await this.prismaService.$transaction(async tx => {
			const actor = await this.assertMembership(
				data.communityId,
				data.actorUserId,
				tx
			)
			this.assertRoleAtLeast(actor.role, 'MODERATOR')

			const ban = await this.banRepository.find(
				data.communityId,
				data.targetUserId,
				tx
			)
			if (!ban) this.notFound('Ban not found')

			await this.banRepository.delete(
				data.communityId,
				data.targetUserId,
				tx
			)
		})

		return { ok: true }
	}

	async listCommunityMembers(data: ListCommunityMembersRequest) {
		await this.assertMembership(data.communityId, data.requesterUserId)

		const members = await this.membershipRepository.listByCommunity(
			data.communityId
		)

		return {
			members: members.map(member => this.mapMember(member))
		}
	}

	private async assertMembership(
		communityId: string,
		userId: string,
		tx?: Prisma.TransactionClient
	) {
		const membership = await this.membershipRepository.find(
			communityId,
			userId,
			tx
		)

		if (!membership)
			this.fail(
				RpcStatus.PERMISSION_DENIED,
				'User is not a member of this community'
			)

		return membership
	}

	private assertRoleAtLeast(
		currentRole: PrismaCommunityRole,
		requiredRole: PrismaCommunityRole
	) {
		if (ROLE_RANK[currentRole] < ROLE_RANK[requiredRole]) {
			this.fail(
				RpcStatus.PERMISSION_DENIED,
				'Insufficient community role'
			)
		}
	}

	private assertCanBan(
		actorRole: PrismaCommunityRole,
		targetRole: PrismaCommunityRole
	) {
		if (actorRole === 'OWNER') {
			if (targetRole === 'OWNER') {
				this.fail(
					RpcStatus.PERMISSION_DENIED,
					'Owner cannot ban another owner'
				)
			}
			return
		}

		if (actorRole === 'MODERATOR') {
			if (targetRole !== 'MEMBER') {
				this.fail(
					RpcStatus.PERMISSION_DENIED,
					'Moderator can ban only members'
				)
			}
			return
		}

		this.fail(
			RpcStatus.PERMISSION_DENIED,
			'Only owner or moderator can ban'
		)
	}

	private async assertNotBanned(
		communityId: string,
		userId: string,
		tx?: Prisma.TransactionClient
	) {
		const ban = await this.banRepository.find(communityId, userId, tx)
		if (!ban) return

		if (!ban.expiresAt || ban.expiresAt.getTime() > Date.now()) {
			this.fail(
				RpcStatus.PERMISSION_DENIED,
				'User is banned in this community'
			)
		}
	}

	private async syncMembersCount(
		communityId: string,
		tx: Prisma.TransactionClient
	) {
		const membersCount = await this.membershipRepository.count(
			communityId,
			tx
		)
		await this.communityRepository.updateMembersCount(
			communityId,
			membersCount,
			tx
		)
	}

	private toVisibility(
		value: ProtoVisibility | string | number
	): PrismaCommunityVisibility {
		switch (value) {
			case 'COMMUNITY_VISIBILITY_PUBLIC':
			case 'PUBLIC':
			case PROTO_VISIBILITY_PUBLIC:
				return 'PUBLIC'
			case 'COMMUNITY_VISIBILITY_PRIVATE':
			case 'PRIVATE':
			case PROTO_VISIBILITY_PRIVATE:
				return 'PRIVATE'
			default:
				this.fail(
					RpcStatus.INVALID_ARGUMENT,
					'Invalid community visibility'
				)
		}
	}

	private toRole(value: ProtoRole): PrismaCommunityRole {
		switch (value) {
			case PROTO_ROLE_MEMBER:
				return 'MEMBER'
			case PROTO_ROLE_MODERATOR:
				return 'MODERATOR'
			case PROTO_ROLE_OWNER:
				return 'OWNER'
			default:
				this.fail(RpcStatus.INVALID_ARGUMENT, 'Invalid community role')
		}
	}

	private mapVisibility(value: PrismaCommunityVisibility) {
		if (value === 'PRIVATE') {
			return PROTO_VISIBILITY_PRIVATE
		}
		return PROTO_VISIBILITY_PUBLIC
	}

	private mapRole(value: PrismaCommunityRole) {
		switch (value) {
			case 'OWNER':
				return PROTO_ROLE_OWNER
			case 'MODERATOR':
				return PROTO_ROLE_MODERATOR
			default:
				return PROTO_ROLE_MEMBER
		}
	}

	private mapInviteStatus(value: CommunityInviteStatus) {
		switch (value) {
			case 'ACCEPTED':
				return PROTO_INVITE_STATUS_ACCEPTED
			case 'DECLINED':
				return PROTO_INVITE_STATUS_DECLINED
			case 'CANCELED':
				return PROTO_INVITE_STATUS_CANCELED
			default:
				return PROTO_INVITE_STATUS_PENDING
		}
	}

	private mapCommunity(community: DbCommunity) {
		return {
			id: community.id,
			description: community.description,
			visibility: this.mapVisibility(community.visibility),
			locationCountry: community.locationCountry ?? undefined,
			locationCity: community.locationCity ?? undefined,
			locationStreet: community.locationStreet ?? undefined,
			locationHouse: community.locationHouse ?? undefined,
			avatar: community.avatar ?? undefined,
			cover: community.cover ?? undefined,
			membersCount: community.membersCount,
			createdByUserId: community.createdByUserId,
			createdAt: community.createdAt.toISOString(),
			updatedAt: community.updatedAt.toISOString()
		}
	}

	private mapMember(member: CommunityMembership) {
		return {
			id: member.id,
			communityId: member.communityId,
			userId: member.userId,
			role: this.mapRole(member.role),
			createdAt: member.createdAt.toISOString(),
			updatedAt: member.updatedAt.toISOString()
		}
	}

	private mapInvite(invite: CommunityInvite) {
		return {
			id: invite.id,
			communityId: invite.communityId,
			invitedUserId: invite.invitedUserId,
			invitedByUserId: invite.invitedByUserId,
			status: this.mapInviteStatus(invite.status),
			expiresAt: invite.expiresAt.toISOString(),
			createdAt: invite.createdAt.toISOString(),
			updatedAt: invite.updatedAt.toISOString()
		}
	}

	private fail(code: number, message: string): never {
		throw new RpcException({ code, message })
	}

	private notFound(message: string): never {
		this.fail(RpcStatus.NOT_FOUND, message)
	}
}
