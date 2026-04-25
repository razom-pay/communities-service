import {
	Injectable,
	type OnModuleDestroy,
	type OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { PinoLogger } from 'nestjs-pino'

import { InitiativeService } from './initiative.service'

@Injectable()
export class InitiativeScheduler implements OnModuleInit, OnModuleDestroy {
	private readonly jobName = 'initiative-finalize-expired'

	constructor(
		private readonly logger: PinoLogger,
		private readonly configService: ConfigService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly initiativeService: InitiativeService
	) {
		this.logger.setContext(InitiativeScheduler.name)
	}

	onModuleInit() {
		const cronExpression =
			this.configService.get<string>('INITIATIVE_FINALIZE_CRON') ??
			'*/30 * * * * *'

		const job = new CronJob(cronExpression, () => {
			void this.handleFinalizeExpired()
		})

		this.schedulerRegistry.addCronJob(this.jobName, job)
		job.start()
	}

	onModuleDestroy() {
		try {
			const job = this.schedulerRegistry.getCronJob(this.jobName)
			job.stop()
			this.schedulerRegistry.deleteCronJob(this.jobName)
		} catch {
			// Cron job was not initialized.
		}
	}

	async handleFinalizeExpired() {
		const processed = await this.initiativeService.finalizeExpiredBatch()
		if (processed > 0) {
			this.logger.info(
				{ processed },
				'Finalized expired initiatives batch'
			)
		}
	}
}
