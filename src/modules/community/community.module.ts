import { Module } from '@nestjs/common'

import { CommunityBanRepository } from './community-ban.repository'
import { CommunityInviteRepository } from './community-invite.repository'
import { CommunityMembershipRepository } from './community-membership.repository'
import { CommunityController } from './community.controller'
import { CommunityRepository } from './community.repository'
import { CommunityService } from './community.service'

@Module({
	controllers: [CommunityController],
	providers: [
		CommunityService,
		CommunityRepository,
		CommunityMembershipRepository,
		CommunityInviteRepository,
		CommunityBanRepository
	]
})
export class CommunityModule {}
