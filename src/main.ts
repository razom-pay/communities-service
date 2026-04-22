import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { createGrpcServer } from './infra/grpc/grpc.server'
import './observability/tracing'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	const configService = app.get(ConfigService)

	createGrpcServer(app, configService)

	await app.startAllMicroservices()
	await app.listen(9104)
}

bootstrap()
