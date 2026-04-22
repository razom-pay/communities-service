import type { GrpcOptions } from '@nestjs/microservices'
import { PROTO_PATHS } from '@razom-pay/contracts'

export const grpcPackages = ['community.v1']
export const grpcProtoPaths = [PROTO_PATHS.COMMUNITY]
export const grpcLoader: NonNullable<GrpcOptions['options']['loader']> = {
	keepCase: false,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true
}
