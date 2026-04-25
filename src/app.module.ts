import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'

import { PrismaModule } from './infra/prisma/prisma.module'
import { CommunitiesModule } from './modules/communities/communities.module'
import { ObservabilityModule } from './observability/observability.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: [
				`.env.${process.env.NODE_ENV}.local`,
				`.env.${process.env.NODE_ENV}`,
				'.env'
			]
		}),
		LoggerModule.forRoot({
			pinoHttp: {
				level: process.env.LOG_LEVEL || 'info',
				transport:
					process.env.NODE_ENV === 'test'
						? undefined
						: {
								target: 'pino/file',
								options: {
									destination:
										process.platform === 'linux'
											? '/var/log/services/communities/communities.log'
											: '.logs/communities/communities.log',
									mkdir: true
								}
							},
				messageKey: 'msg',
				customProps: () => ({
					service: 'communities-service'
				})
			}
		}),
		ObservabilityModule,
		PrismaModule,
		CommunitiesModule
	]
})
export class AppModule {}
