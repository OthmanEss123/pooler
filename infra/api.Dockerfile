FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
COPY proto ./proto

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

EXPOSE 3000 50051

CMD ["node", "dist/main"]
