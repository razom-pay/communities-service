import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { ScheduleModule } from '@nestjs/schedule'

import { PrismaModule } from '@/infra/prisma/prisma.module'

import { CommunitiesModule } from '../communities/communities.module'

import { InitiativeFinalizeService } from './initiative-finalize.service'
import { InitiativesController } from './initiatives.controller'
import { InitiativesRepository } from './initiatives.repository'
import { InitiativesService } from './initiatives.service'

@Module({
	imports: [
		PrismaModule,
		CommunitiesModule,
		ScheduleModule.forRoot(),
		ClientsModule.registerAsync([
			{
				name: 'ESCROW_CLIENT',
				useFactory: (configService: ConfigService) => ({
					transport: Transport.RMQ,
					options: {
						urls: [configService.getOrThrow<string>('RMQ_URL')],
						queue: 'escrow_queue',
						queueOptions: { durable: true }
					}
				}),
				inject: [ConfigService]
			}
		])
	],
	controllers: [InitiativesController],
	providers: [InitiativesService, InitiativesRepository, InitiativeFinalizeService],
	exports: [InitiativesService]
})
export class InitiativesModule {}
