import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ClientProxy } from '@nestjs/microservices'

import { InitiativesRepository } from './initiatives.repository'

@Injectable()
export class InitiativeFinalizeService {
	private readonly logger = new Logger(InitiativeFinalizeService.name)

	constructor(
		private readonly initiativesRepository: InitiativesRepository,
		@Inject('ESCROW_CLIENT') private readonly escrowClient: ClientProxy
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async finalizeExpiredInitiatives() {
		const now = new Date()
		const expired = await this.initiativesRepository.findExpiredActive(now)

		if (expired.length === 0) return

		this.logger.log(
			`Found ${expired.length} expired initiative(s), triggering settlement`
		)

		for (const initiative of expired) {
			try {
				await this.initiativesRepository.updateStatus(
					initiative.id,
					'PROCESSING'
				)

				this.escrowClient
					.emit('initiative.deadline_reached', {
						initiativeId: initiative.id
					})
					.subscribe({
						error: (err: unknown) =>
							this.logger.error(
								`Failed to publish deadline event for ${initiative.id}`,
								err
							)
					})

				this.logger.log(
					`Published deadline_reached for initiative ${initiative.id}`
				)
			} catch (err) {
				this.logger.error(
					`Failed to process initiative ${initiative.id}`,
					err
				)
			}
		}
	}
}
