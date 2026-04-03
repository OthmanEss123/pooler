#!/usr/bin/env sh
set -e

echo "Build application..."
npm run build

echo "Apply database migrations..."
npx prisma migrate deploy

echo "Restart PM2..."
pm2 restart api

echo "Deployment done."
