# Dockerfile для Lynqx Server
# Alpine, non-root user, оптимизированный размер

FROM node:20-alpine AS base

# Установка зависимостей для Prisma
RUN apk add --no-cache openssl

# Создаем пользователя для запуска от non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Копируем package files
COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем зависимости
RUN npm ci --only=production && \
    npm cache clean --force

# Генерируем Prisma Client
RUN npx prisma generate

# Копируем исходный код
COPY src ./src

# Меняем владельца на non-root пользователя
RUN chown -R nodejs:nodejs /app

# Переключаемся на non-root пользователя
USER nodejs

# Порт приложения
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Запуск приложения
CMD ["node", "src/main.js"]
