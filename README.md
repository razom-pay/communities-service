# communities-service

Communities domain microservice for Razom Pay.

## Run

```bash
yarn install
yarn start:dev
```

## Environment

- `GRPC_HOST`
- `GRPC_PORT`
- `DATABASE_URI`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`

## Prisma

```bash
yarn prisma generate
yarn prisma migrate dev --name init
```
