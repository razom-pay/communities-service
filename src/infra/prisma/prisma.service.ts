import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/generated/client'

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(PrismaService.name)

	constructor(private readonly configService: ConfigService) {
		const adapter = new PrismaPg({
			user: configService.getOrThrow<string>('DB_USER'),
			password: configService.getOrThrow<string>('DB_PASS'),
			host: configService.getOrThrow<string>('DB_HOST'),
			port: configService.getOrThrow<number>('DB_PORT'),
			database: configService.getOrThrow<string>('DB_NAME')
		})

		super({ adapter })
	}

	async onModuleInit() {
		const start = Date.now()

		this.logger.log('Connecting to the database...')

		try {
			await this.$connect()

			const ms = Date.now() - start
			this.logger.log(`Connected to the database in ${ms}ms`)
		} catch (error) {
			this.logger.error('Failed to connect to the database: ', error)
			throw error
		}
	}

	async onModuleDestroy() {
		this.logger.log('Disconnecting from the database...')

		try {
			await this.$disconnect()
			this.logger.log('Disconnected from the database')
		} catch (error) {
			this.logger.error('Failed to disconnect from the database: ', error)
		}
	}
}
