/**
 * REST API маршруты
 * /health - проверка здоровья
 * /sync - начальная синхронизация
 * /auth - базовая аутентификация
 */

const express = require('express');
const { prisma } = require('../db');
const roomService = require('../services/room');

const router = express.Router();

/**
 * GET /health
 * Проверка здоровья сервера и подключения к БД
 */
router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

/**
 * POST /auth/login
 * Простая аутентификация по токену (для MVP)
 * В продакшене заменить на OAuth/JWT
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Требуется токен' });
    }
    
    const user = await prisma.user.findUnique({
      where: { token },
      select: {
        id: true,
        username: true,
        avatar: true,
        createdAt: true,
      },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Неверный токен' });
    }
    
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /auth/register
 * Регистрация нового пользователя
 */
router.post('/auth/register', async (req, res) => {
  try {
    const { username, avatar } = req.body;
    
    if (!username || username.length < 2) {
      return res.status(400).json({ error: 'Имя должно быть не менее 2 символов' });
    }
    
    // Генерируем простой токен
    const token = `lynqx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const user = await prisma.user.create({
      data: {
        username,
        avatar: avatar || null,
        token,
      },
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
      token: user.token,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
    }
    
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /sync
 * Начальная синхронизация для клиента
 */
router.get('/sync', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Требуется токен' });
    }
    
    const user = await prisma.user.findUnique({
      where: { token },
      include: {
        sessions: {
          include: {
            session: {
              include: {
                rooms: {
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Неверный токен' });
    }
    
    const syncData = {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
      sessions: user.sessions.map(sm => ({
        id: sm.session.id,
        name: sm.session.name,
        description: sm.session.description,
        role: sm.role,
        muted: sm.muted,
        deafened: sm.deafened,
        rooms: sm.session.rooms.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          config: r.config,
        })),
      })),
      timestamp: Date.now(),
    };
    
    res.json(syncData);
  } catch (error) {
    console.error('Ошибка синхронизации:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /rooms/:roomId
 * Получить состояние конкретной комнаты
 */
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const room = await roomService.getRoomWithMembers(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }
    
    res.json(room);
  } catch (error) {
    console.error('Ошибка получения комнаты:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /sessions
 * Список всех доступных сессий
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      include: {
        rooms: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    
    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        memberCount: s._count.members,
        rooms: s.rooms,
      })),
    });
  } catch (error) {
    console.error('Ошибка получения сессий:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
