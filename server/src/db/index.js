/**
 * Модуль работы с базой данных (Prisma)
 */

const { PrismaClient } = require('@prisma/client');
const config = require('../config');

// Создаем клиент Prisma
const prisma = new PrismaClient({
  log: config.env === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'],
});

/**
 * Инициализация подключения к БД
 */
async function connect() {
  try {
    await prisma.$connect();
    console.log('✅ База данных подключена');
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к БД:', error.message);
    throw error;
  }
}

/**
 * Закрытие подключения к БД
 */
async function disconnect() {
  try {
    await prisma.$disconnect();
    console.log('🔌 База данных отключена');
  } catch (error) {
    console.error('Ошибка при отключении БД:', error.message);
  }
}

/**
 * Применение миграций при старте
 */
async function runMigrations() {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    console.log('🔄 Применение миграций...');
    await execPromise('npx prisma migrate deploy', {
      cwd: __dirname + '/..',
      env: { ...process.env, DATABASE_URL: config.databaseUrl }
    });
    console.log('✅ Миграции применены');
  } catch (error) {
    console.error('⚠️  Ошибка применения миграций:', error.message);
    // Не прерываем старт, если миграции не применились
  }
}

module.exports = {
  prisma,
  connect,
  disconnect,
  runMigrations,
};
