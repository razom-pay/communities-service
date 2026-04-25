import { Module } from '@nestjs/common'
 
import { CommunitiesController } from './communities.controller'
import { CommunitiesRepository } from './communities.repository'
import { CommunitiesService } from './communities.service'
import { CommunityBanRepository } from './community-ban.repository'
import { CommunityInviteRepository } from './community-invite.repository'
import { CommunityMembershipRepository } from './community-membership.repository'
 
@Module({
	controllers: [CommunitiesController],
	providers: [
		CommunitiesService,
		CommunitiesRepository,
		CommunityMembershipRepository,
		CommunityInviteRepository,
		CommunityBanRepository
	]
})
export class CommunitiesModule {}

