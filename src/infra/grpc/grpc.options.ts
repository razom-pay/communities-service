import type { GrpcOptions } from '@nestjs/microservices'
import { PROTO_PATHS } from '@razom-pay/contracts'

export const grpcPackages = ['communities.v1']
export const grpcProtoPaths = [PROTO_PATHS.COMMUNITIES]
export const grpcLoader: NonNullable<GrpcOptions['options']['loader']> = {
	keepCase: false,
	longs: String,
	enums: Number,
	defaults: true,
	oneofs: true
}
