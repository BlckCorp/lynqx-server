/**
 * Конфигурация приложения
 * Все настройки через .env, никаких process.env в бизнес-логике
 */

const config = {
  // Сервер
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  
  // База данных
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lynqx?schema=public',
  
  // WebSocket Gateway
  ws: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
    maxReconnectDelay: parseInt(process.env.WS_MAX_RECONNECT_DELAY || '5000', 10),
  },
  
  // Аутентификация
  auth: {
    tokenPrefix: process.env.AUTH_TOKEN_PREFIX || 'lynqx_',
  },
  
  // Логирование
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Режим (development/production)
  env: process.env.NODE_ENV || 'development',
};

// Валидация обязательных переменных
const requiredEnvVars = ['DATABASE_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️  Переменная окружения ${envVar} не установлена`);
  }
}

module.exports = config;
