import { Module } from '@nestjs/common'

import { PrismaModule } from '@/infra/prisma/prisma.module'

import { CommunitiesModule } from '../communities/communities.module'

import { InitiativesController } from './initiatives.controller'
import { InitiativesRepository } from './initiatives.repository'
import { InitiativesService } from './initiatives.service'

@Module({
	imports: [PrismaModule, CommunitiesModule],
	controllers: [InitiativesController],
	providers: [InitiativesService, InitiativesRepository],
	exports: [InitiativesService]
})
export class InitiativesModule {}
