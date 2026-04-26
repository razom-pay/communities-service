import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/generated/client'

import { PrismaService } from '@/infra/prisma/prisma.service'

@Injectable()
export class InitiativesRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(data: Prisma.InitiativeCreateInput) {
		return this.prisma.initiative.create({ data })
	}

	async findById(id: string) {
		return this.prisma.initiative.findUnique({
			where: { id }
		})
	}

	async listByCommunityId(communityId: string) {
		return this.prisma.initiative.findMany({
			where: { communityId },
			orderBy: { createdAt: 'desc' }
		})
	}

	async createContribution(data: Prisma.InitiativeContributionCreateInput) {
		return this.prisma.initiativeContribution.create({ data })
	}
}
