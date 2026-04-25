import { Controller } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import type {
	CancelInitiativeRequest,
	ContributeToInitiativeRequest,
	CreateInitiativeRequest,
	FinalizeInitiativeRequest,
	GetInitiativeRequest,
	ListCommunityInitiativesRequest,
	ListMyInitiativeContributionsRequest
} from '@razom-pay/contracts/gen/community'

import { InitiativeService } from './initiative.service'

@Controller('initiative')
export class InitiativeController {
	constructor(private readonly initiativeService: InitiativeService) {}

	@GrpcMethod('InitiativeService', 'CreateInitiative')
	createInitiative(data: CreateInitiativeRequest) {
		return this.initiativeService.createInitiative(data)
	}

	@GrpcMethod('InitiativeService', 'GetInitiative')
	getInitiative(data: GetInitiativeRequest) {
		return this.initiativeService.getInitiative(data)
	}

	@GrpcMethod('InitiativeService', 'ListCommunityInitiatives')
	listCommunityInitiatives(data: ListCommunityInitiativesRequest) {
		return this.initiativeService.listCommunityInitiatives(data)
	}

	@GrpcMethod('InitiativeService', 'ContributeToInitiative')
	contributeToInitiative(data: ContributeToInitiativeRequest) {
		return this.initiativeService.contributeToInitiative(data)
	}

	@GrpcMethod('InitiativeService', 'ListMyInitiativeContributions')
	listMyInitiativeContributions(data: ListMyInitiativeContributionsRequest) {
		return this.initiativeService.listMyInitiativeContributions(data)
	}

	@GrpcMethod('InitiativeService', 'CancelInitiative')
	cancelInitiative(data: CancelInitiativeRequest) {
		return this.initiativeService.cancelInitiative(data)
	}

	@GrpcMethod('InitiativeService', 'FinalizeInitiative')
	finalizeInitiative(data: FinalizeInitiativeRequest) {
		return this.initiativeService.finalizeInitiative(data)
	}
}
