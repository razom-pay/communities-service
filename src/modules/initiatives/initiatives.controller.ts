import { Controller } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import type {
	ContributeToInitiativeRequest,
	ContributeToInitiativeResponse,
	CreateInitiativeRequest,
	CreateInitiativeResponse,
	GetInitiativeRequest,
	GetInitiativeResponse,
	ListCommunityInitiativesRequest,
	ListCommunityInitiativesResponse
} from '@razom-pay/contracts/gen/communities'

import { InitiativesService } from './initiatives.service'

@Controller()
export class InitiativesController {
	constructor(private readonly initiativesService: InitiativesService) {}

	@GrpcMethod('CommunitiesService', 'CreateInitiative')
	async createInitiative(
		data: CreateInitiativeRequest
	): Promise<CreateInitiativeResponse> {
		const initiative = await this.initiativesService.createInitiative(data)
		return { initiative }
	}

	@GrpcMethod('CommunitiesService', 'GetInitiative')
	async getInitiative(
		data: GetInitiativeRequest
	): Promise<GetInitiativeResponse> {
		const initiative = await this.initiativesService.getInitiative(
			data.initiativeId
		)
		return { initiative }
	}

	@GrpcMethod('CommunitiesService', 'ListCommunityInitiatives')
	async listCommunityInitiatives(
		data: ListCommunityInitiativesRequest
	): Promise<ListCommunityInitiativesResponse> {
		const initiatives =
			await this.initiativesService.listCommunityInitiatives(
				data.communityId
			)
		return { initiatives }
	}

	@GrpcMethod('CommunitiesService', 'ContributeToInitiative')
	async contributeToInitiative(
		data: ContributeToInitiativeRequest
	): Promise<ContributeToInitiativeResponse> {
		const contribution =
			await this.initiativesService.contributeToInitiative(data)
		return { contribution }
	}
}
