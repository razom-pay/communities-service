import { Injectable } from '@nestjs/common'
import type { InitiativeStatus, Prisma } from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class InitiativesRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(data: Prisma.InitiativeCreateInput) {
		return this.prisma.initiative.create({ data })
	}

	async findById(id: string) {
		return this.prisma.initiative.findUnique({ where: { id } })
	}

	async listByCommunityId(communityId: string) {
		return this.prisma.initiative.findMany({
			where: { communityId },
			orderBy: { createdAt: 'desc' }
		})
	}

	async updateStatus(id: string, status: InitiativeStatus) {
		return this.prisma.initiative.update({
			where: { id },
			data: { status }
		})
	}

	async findExpiredActive(now: Date) {
		return this.prisma.initiative.findMany({
			where: {
				status: 'ACTIVE',
				deadline: { lte: now }
			}
		})
	}
}
