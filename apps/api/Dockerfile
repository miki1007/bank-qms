FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @qms/api prisma generate && pnpm --filter @qms/api build

FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@qms/api", "start"]

