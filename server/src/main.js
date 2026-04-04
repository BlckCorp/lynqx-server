/**
 * Главный файл приложения Lynqx Server
 * Инициализация Express, Socket.io, Prisma
 * Graceful shutdown
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const config = require('./config');
const { connect, disconnect, runMigrations } = require('./db');
const { initGateway } = require('./gateway');
const apiRoutes = require('./api/routes');

// Создаем Express приложение
const app = express();
const httpServer = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логгер запросов (development)
if (config.env === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} - ${Date.now() - start}ms`);
    });
    next();
  });
}

// Подключаем API маршруты
app.use('/api', apiRoutes);

// Базовый маршрут
app.get('/', (req, res) => {
  res.json({
    name: 'Lynqx Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      sync: '/api/sync',
      auth: '/api/auth',
      gateway: 'ws://localhost:' + config.port,
    },
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err);
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    message: config.env === 'development' ? err.message : undefined,
  });
});

// Переменные для graceful shutdown
let isShuttingDown = false;

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n🛑 Получен сигнал ${signal}. Завершение работы...`);
  
  // Закрываем HTTP сервер
  httpServer.close(async () => {
    console.log('🔌 HTTP сервер остановлен');
    
    // Отключаемся от БД
    await disconnect();
    
    console.log('✅ Завершение работы завершено');
    process.exit(0);
  });
  
  // Принудительное завершение через 30 секунд
  setTimeout(() => {
    console.error('❌ Принудительное завершение работы');
    process.exit(1);
  }, 30000);
}

// Обработчики сигналов
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Необработанные ошибки
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

/**
 * Запуск сервера
 */
async function start() {
  try {
    console.log('🚀 Запуск Lynqx Server...');
    console.log(`📋 Режим: ${config.env}`);
    
    // Применяем миграции БД
    await runMigrations();
    
    // Подключаемся к БД
    await connect();
    
    // Инициализируем WebSocket Gateway
    initGateway(httpServer);
    
    // Запускаем HTTP сервер
    httpServer.listen(config.port, config.host, () => {
      console.log(`✅ Сервер запущен на http://${config.host}:${config.port}`);
      console.log(`📡 Gateway: ws://${config.host}:${config.port}`);
      console.log(`🏥 Health: http://${config.host}:${config.port}/api/health`);
    });
    
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

// Запускаем
start();

module.exports = { app, httpServer };
