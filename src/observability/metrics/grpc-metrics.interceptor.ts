import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor
} from '@nestjs/common'
import { InjectMetric } from '@willsoto/nestjs-prometheus'
import { Counter, Histogram } from 'prom-client'
import { type Observable, tap } from 'rxjs'

@Injectable()
export class GrpcMetricsInterceptor implements NestInterceptor {
	private readonly SERVICE_NAME: string

	constructor(
		@InjectMetric('grpc_requests_total')
		private readonly counter: Counter<string>,
		@InjectMetric('grpc_request_duration_seconds')
		private readonly histogram: Histogram<string>
	) {
		this.SERVICE_NAME = 'communities'
	}

	intercept(
		context: ExecutionContext,
		next: CallHandler<any>
	): Observable<any> {
		const handler = context.getHandler().name
		const endTimer = this.histogram.startTimer({
			service: this.SERVICE_NAME,
			method: handler
		})

		return next.handle().pipe(
			tap({
				next: () => {
					this.counter.inc({
						service: this.SERVICE_NAME,
						method: handler,
						status: 'OK'
					})
					endTimer()
				},
				error: () => {
					this.counter.inc({
						service: this.SERVICE_NAME,
						method: handler,
						status: 'ERROR'
					})
					endTimer()
				}
			})
		)
	}
}
