import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/infra/prisma/prisma.service'

describe('AppController (e2e)', () => {
	let app: INestApplication<App>

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule]
		})
			.overrideProvider(PrismaService)
			.useValue({})
			.compile()

		app = moduleFixture.createNestApplication()
		await app.init()
	})

	it('/metrics (GET)', () => {
		return request(app.getHttpServer()).get('/metrics').expect(200)
	})
})
