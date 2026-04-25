import { Controller } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import type {
	AcceptInviteRequest,
	AssignRoleRequest,
	BanMemberRequest,
	CreateCommunityRequest,
	DeclineInviteRequest,
	GetCommunityRequest,
	InviteMemberRequest,
	JoinCommunityRequest,
	LeaveCommunityRequest,
	ListCommunityMembersRequest,
	ListMyCommunitiesRequest,
	PatchCommunityRequest,
	UnbanMemberRequest
} from '@razom-pay/contracts/gen/communities'

import { CommunitiesService } from './communities.service'

@Controller('communities')
export class CommunitiesController {
	constructor(private readonly communitiesService: CommunitiesService) {}

	@GrpcMethod('CommunitiesService', 'CreateCommunity')
	createCommunity(data: CreateCommunityRequest) {
		return this.communitiesService.createCommunity(data)
	}

	@GrpcMethod('CommunitiesService', 'GetCommunity')
	getCommunity(data: GetCommunityRequest) {
		return this.communitiesService.getCommunity(data)
	}

	@GrpcMethod('CommunitiesService', 'PatchCommunity')
	patchCommunity(data: PatchCommunityRequest) {
		return this.communitiesService.patchCommunity(data)
	}

	@GrpcMethod('CommunitiesService', 'ListMyCommunities')
	listMyCommunities(data: ListMyCommunitiesRequest) {
		return this.communitiesService.listMyCommunities(data)
	}

	@GrpcMethod('CommunitiesService', 'JoinCommunity')
	joinCommunity(data: JoinCommunityRequest) {
		return this.communitiesService.joinCommunity(data)
	}

	@GrpcMethod('CommunitiesService', 'LeaveCommunity')
	leaveCommunity(data: LeaveCommunityRequest) {
		return this.communitiesService.leaveCommunity(data)
	}

	@GrpcMethod('CommunitiesService', 'InviteMember')
	inviteMember(data: InviteMemberRequest) {
		return this.communitiesService.inviteMember(data)
	}

	@GrpcMethod('CommunitiesService', 'AcceptInvite')
	acceptInvite(data: AcceptInviteRequest) {
		return this.communitiesService.acceptInvite(data)
	}

	@GrpcMethod('CommunitiesService', 'DeclineInvite')
	declineInvite(data: DeclineInviteRequest) {
		return this.communitiesService.declineInvite(data)
	}

	@GrpcMethod('CommunitiesService', 'AssignRole')
	assignRole(data: AssignRoleRequest) {
		return this.communitiesService.assignRole(data)
	}

	@GrpcMethod('CommunitiesService', 'BanMember')
	banMember(data: BanMemberRequest) {
		return this.communitiesService.banMember(data)
	}

	@GrpcMethod('CommunitiesService', 'UnbanMember')
	unbanMember(data: UnbanMemberRequest) {
		return this.communitiesService.unbanMember(data)
	}

	@GrpcMethod('CommunitiesService', 'ListCommunityMembers')
	listCommunityMembers(data: ListCommunityMembersRequest) {
		return this.communitiesService.listCommunityMembers(data)
	}
}

