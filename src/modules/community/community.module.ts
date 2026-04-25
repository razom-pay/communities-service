import { Module } from '@nestjs/common'

import { CommunityBanRepository } from './community-ban.repository'
import { CommunityInviteRepository } from './community-invite.repository'
import { CommunityMembershipRepository } from './community-membership.repository'
import { CommunityController } from './community.controller'
import { CommunityRepository } from './community.repository'
import { CommunityService } from './community.service'
import { InitiativeContributionRepository } from './initiative-contribution.repository'
import { InitiativeController } from './initiative.controller'
import { InitiativeRepository } from './initiative.repository'
import { InitiativeScheduler } from './initiative.scheduler'
import { InitiativeService } from './initiative.service'
import { InitiativeSettlementRepository } from './initiative-settlement.repository'
import { InitiativeWholesaleTierRepository } from './initiative-wholesale-tier.repository'

@Module({
	controllers: [CommunityController, InitiativeController],
	providers: [
		CommunityService,
		CommunityRepository,
		CommunityMembershipRepository,
		CommunityInviteRepository,
		CommunityBanRepository,
		InitiativeService,
		InitiativeRepository,
		InitiativeWholesaleTierRepository,
		InitiativeContributionRepository,
		InitiativeSettlementRepository,
		InitiativeScheduler
	]
})
export class CommunityModule {}
