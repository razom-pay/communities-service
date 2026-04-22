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
} from '@razom-pay/contracts/gen/community'

import { CommunityService } from './community.service'

@Controller('community')
export class CommunityController {
	constructor(private readonly communityService: CommunityService) {}

	@GrpcMethod('CommunityService', 'CreateCommunity')
	createCommunity(data: CreateCommunityRequest) {
		return this.communityService.createCommunity(data)
	}

	@GrpcMethod('CommunityService', 'GetCommunity')
	getCommunity(data: GetCommunityRequest) {
		return this.communityService.getCommunity(data)
	}

	@GrpcMethod('CommunityService', 'PatchCommunity')
	patchCommunity(data: PatchCommunityRequest) {
		return this.communityService.patchCommunity(data)
	}

	@GrpcMethod('CommunityService', 'ListMyCommunities')
	listMyCommunities(data: ListMyCommunitiesRequest) {
		return this.communityService.listMyCommunities(data)
	}

	@GrpcMethod('CommunityService', 'JoinCommunity')
	joinCommunity(data: JoinCommunityRequest) {
		return this.communityService.joinCommunity(data)
	}

	@GrpcMethod('CommunityService', 'LeaveCommunity')
	leaveCommunity(data: LeaveCommunityRequest) {
		return this.communityService.leaveCommunity(data)
	}

	@GrpcMethod('CommunityService', 'InviteMember')
	inviteMember(data: InviteMemberRequest) {
		return this.communityService.inviteMember(data)
	}

	@GrpcMethod('CommunityService', 'AcceptInvite')
	acceptInvite(data: AcceptInviteRequest) {
		return this.communityService.acceptInvite(data)
	}

	@GrpcMethod('CommunityService', 'DeclineInvite')
	declineInvite(data: DeclineInviteRequest) {
		return this.communityService.declineInvite(data)
	}

	@GrpcMethod('CommunityService', 'AssignRole')
	assignRole(data: AssignRoleRequest) {
		return this.communityService.assignRole(data)
	}

	@GrpcMethod('CommunityService', 'BanMember')
	banMember(data: BanMemberRequest) {
		return this.communityService.banMember(data)
	}

	@GrpcMethod('CommunityService', 'UnbanMember')
	unbanMember(data: UnbanMemberRequest) {
		return this.communityService.unbanMember(data)
	}

	@GrpcMethod('CommunityService', 'ListCommunityMembers')
	listCommunityMembers(data: ListCommunityMembersRequest) {
		return this.communityService.listCommunityMembers(data)
	}
}
