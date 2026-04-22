FROM node:22.19.0-alpine AS builder

WORKDIR /app

COPY package*.json yarn.lock ./

RUN yarn install

COPY . .

RUN yarn prisma generate

RUN yarn build

FROM node:22.19.0-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json yarn.lock prisma.config.ts ./

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

CMD ["node", "dist/src/main"]

