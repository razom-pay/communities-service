import { Injectable } from '@nestjs/common'
import { RpcException } from '@nestjs/microservices'
import { Prisma } from '@prisma/generated/client'
import { RpcStatus } from '@razom-pay/common'
import {
	CreateInitiativeRequest,
	InitiativeStatus,
	InitiativeType
} from '@razom-pay/contracts/gen/communities'

import { CommunityMembershipRepository } from '../communities/community-membership.repository'

import { InitiativesRepository } from './initiatives.repository'

@Injectable()
export class InitiativesService {
	constructor(
		private readonly initiativesRepository: InitiativesRepository,
		private readonly membershipRepository: CommunityMembershipRepository
	) {}

	private async ensureMember(communityId: string, userId: string) {
		const membership = await this.membershipRepository.find(
			communityId,
			userId
		)
		if (!membership) {
			throw new RpcException({
				code: RpcStatus.PERMISSION_DENIED,
				message: 'User is not a member of this community'
			})
		}
	}

	async createInitiative(data: CreateInitiativeRequest) {
		await this.ensureMember(data.communityId, data.userId)

		const type =
			data.type === InitiativeType.INITIATIVE_TYPE_CROWDFUNDING
				? 'CROWDFUNDING'
				: data.type === InitiativeType.INITIATIVE_TYPE_WHOLESALE
					? 'WHOLESALE'
					: null

		if (!type) {
			throw new RpcException({
				code: RpcStatus.INVALID_ARGUMENT,
				message: 'Invalid initiative type'
			})
		}

		const deadline = new Date(data.deadline)
		if (isNaN(deadline.getTime())) {
			throw new RpcException({
				code: RpcStatus.INVALID_ARGUMENT,
				message: 'Invalid deadline: must be a valid ISO 8601 date string'
			})
		}

		const input: Prisma.InitiativeCreateInput = {
			community: { connect: { id: data.communityId } },
			createdByUserId: data.userId,
			title: data.title,
			description: data.description,
			type,
			status: 'ACTIVE',
			deadline,
			targetAmount: data.targetAmount,
			minContribution: data.minContribution,
			maxContribution: data.maxContribution,
			exactContribution: data.exactContribution,
			wholesaleMaxQuantity: data.wholesaleMaxQuantity,
			wholesaleTiers: data.wholesaleTiers as unknown as Prisma.InputJsonValue
		}

		try {
			const created = await this.initiativesRepository.create(input)
			return this.mapToProto(created)
		} catch (err: any) {
			if (err?.name === 'PrismaClientValidationError') {
				throw new RpcException({
					code: RpcStatus.INVALID_ARGUMENT,
					message: 'Invalid initiative data'
				})
			}
			throw err
		}
	}

	async getInitiative(id: string) {
		const initiative = await this.initiativesRepository.findById(id)
		if (!initiative) {
			throw new RpcException({
				code: RpcStatus.NOT_FOUND,
				message: 'Initiative not found'
			})
		}
		return this.mapToProto(initiative)
	}

	async listCommunityInitiatives(communityId: string) {
		const initiatives =
			await this.initiativesRepository.listByCommunityId(communityId)
		return initiatives.map(i => this.mapToProto(i))
	}

	async updateInitiativeStatus(
		initiativeId: string,
		status: InitiativeStatus
	) {
		const initiative =
			await this.initiativesRepository.findById(initiativeId)
		if (!initiative) {
			throw new RpcException({
				code: RpcStatus.NOT_FOUND,
				message: 'Initiative not found'
			})
		}

		const prismaStatus = this.protoStatusToPrisma(status)
		const updated = await this.initiativesRepository.updateStatus(
			initiativeId,
			prismaStatus
		)
		return this.mapToProto(updated)
	}

	private protoStatusToPrisma(
		status: InitiativeStatus
	): 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PROCESSING' {
		switch (status) {
			case InitiativeStatus.INITIATIVE_STATUS_ACTIVE:
				return 'ACTIVE'
			case InitiativeStatus.INITIATIVE_STATUS_COMPLETED:
				return 'COMPLETED'
			case InitiativeStatus.INITIATIVE_STATUS_FAILED:
				return 'FAILED'
			case InitiativeStatus.INITIATIVE_STATUS_CANCELLED:
				return 'CANCELLED'
			case InitiativeStatus.INITIATIVE_STATUS_PROCESSING:
				return 'PROCESSING'
			default:
				throw new RpcException({
					code: RpcStatus.INVALID_ARGUMENT,
					message: 'Invalid initiative status'
				})
		}
	}

	private mapToProto(initiative: any) {
		return {
			id: initiative.id,
			communityId: initiative.communityId,
			createdByUserId: initiative.createdByUserId,
			title: initiative.title,
			description: initiative.description || undefined,
			type:
				initiative.type === 'CROWDFUNDING'
					? InitiativeType.INITIATIVE_TYPE_CROWDFUNDING
					: InitiativeType.INITIATIVE_TYPE_WHOLESALE,
			status: this.mapStatus(initiative.status),
			deadline: initiative.deadline.toISOString(),
			targetAmount: initiative.targetAmount || undefined,
			minContribution: initiative.minContribution || undefined,
			maxContribution: initiative.maxContribution || undefined,
			exactContribution: initiative.exactContribution || undefined,
			wholesaleMaxQuantity: initiative.wholesaleMaxQuantity || undefined,
			wholesaleTiers: initiative.wholesaleTiers || [],
			createdAt: initiative.createdAt.toISOString(),
			updatedAt: initiative.updatedAt.toISOString()
		}
	}

	private mapStatus(status: string): InitiativeStatus {
		switch (status) {
			case 'ACTIVE':
				return InitiativeStatus.INITIATIVE_STATUS_ACTIVE
			case 'COMPLETED':
				return InitiativeStatus.INITIATIVE_STATUS_COMPLETED
			case 'FAILED':
				return InitiativeStatus.INITIATIVE_STATUS_FAILED
			case 'CANCELLED':
				return InitiativeStatus.INITIATIVE_STATUS_CANCELLED
			case 'PROCESSING':
				return InitiativeStatus.INITIATIVE_STATUS_PROCESSING
			default:
				return InitiativeStatus.INITIATIVE_STATUS_UNSPECIFIED
		}
	}
}
