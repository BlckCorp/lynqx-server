/**
 * WebSocket Gateway - ядро системы в стиле Discord
 * Единое подключение, heartbeat, resume, роутинг событий
 */

const { Server } = require('socket.io');
const config = require('../config');
const roomService = require('../services/room');
const voiceService = require('../services/voice');
const { prisma } = require('../db');

// Хранилище состояний подключенных клиентов
const clientStates = new Map(); // socket.id -> { user, sessionMemberId, lastSequence, buffer }
const sequenceCounter = { value: 0 };

/**
 * Получить следующий номер последовательности для событий
 */
function getNextSequence() {
  sequenceCounter.value++;
  return sequenceCounter.value;
}

/**
 * Отправить событие клиенту с порядковым номером
 */
function emitWithSequence(socket, event, data) {
  const seq = getNextSequence();
  const payload = {
    t: event, // type
    d: data,  // data
    s: seq,   // sequence
  };
  
  socket.emit('GATEWAY_EVENT', payload);
  
  // Сохраняем в буфер для возможного resume
  const state = clientStates.get(socket.id);
  if (state) {
    state.lastSequence = seq;
    state.eventBuffer.push({ event, data, seq, timestamp: Date.now() });
    
    // Держим в буфере только последние 100 событий за 5 минут
    const cutoff = Date.now() - 5 * 60 * 1000;
    state.eventBuffer = state.eventBuffer.filter(e => e.timestamp > cutoff && e.seq >= seq - 100);
  }
  
  return seq;
}

/**
 * Обработчик подключения клиента
 */
function handleConnection(socket) {
  console.log(`🔌 Клиент подключен: ${socket.id}`);
  
  // Инициализируем состояние клиента
  clientStates.set(socket.id, {
    user: null,
    sessionMemberId: null,
    currentRoomId: null,
    lastSequence: 0,
    eventBuffer: [],
    heartbeatInterval: null,
  });
  
  /**
   * IDENTIFY - первичная аутентификация
   * @param {{ token: string }} payload
   */
  socket.on('IDENTIFY', async (payload) => {
    try {
      const { token } = payload;
      
      // Находим пользователя по токену
      const user = await prisma.user.findUnique({
        where: { token },
        include: {
          sessions: {
            include: {
              session: {
                include: {
                  rooms: true,
                },
              },
            },
          },
        },
      });
      
      if (!user) {
        emitWithSequence(socket, 'AUTH_ERROR', { message: 'Неверный токен' });
        socket.disconnect();
        return;
      }
      
      const state = clientStates.get(socket.id);
      state.user = user;
      
      // Формируем ответ READY
      const sessions = user.sessions.map(sm => ({
        id: sm.session.id,
        name: sm.session.name,
        member: {
          id: sm.id,
          role: sm.role,
          muted: sm.muted,
          deafened: sm.deafened,
        },
        rooms: sm.session.rooms.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          config: r.config,
        })),
      }));
      
      emitWithSequence(socket, 'READY', {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
        sessions,
      });
      
      // Запускаем heartbeat
      startHeartbeat(socket);
      
      console.log(`✅ Пользователь аутентифицирован: ${user.username}`);
    } catch (error) {
      console.error('Ошибка IDENTIFY:', error);
      emitWithSequence(socket, 'AUTH_ERROR', { message: 'Внутренняя ошибка сервера' });
    }
  });
  
  /**
   * RESUME - восстановление сессии после переподключения
   * @param {{ token: string, seq: number }} payload
   */
  socket.on('RESUME', async (payload) => {
    try {
      const { token, seq } = payload;
      
      const user = await prisma.user.findUnique({
        where: { token },
      });
      
      if (!user) {
        emitWithSequence(socket, 'AUTH_ERROR', { message: 'Неверный токен' });
        socket.disconnect();
        return;
      }
      
      const state = clientStates.get(socket.id);
      state.user = user;
      state.lastSequence = seq;
      
      // Досылаем пропущенные события из буфера (если найдем предыдущую сессию)
      // В реальной реализации здесь был бы поиск по глобальному буферу пользователя
      emitWithSequence(socket, 'RESUME_COMPLETE', {
        fromSequence: seq,
        toSequence: state.lastSequence,
        missedCount: 0,
      });
      
      startHeartbeat(socket);
      console.log(`🔄 Сессия восстановлена: ${user.username}, seq=${seq}`);
    } catch (error) {
      console.error('Ошибка RESUME:', error);
      emitWithSequence(socket, 'ERROR', { message: 'Ошибка восстановления сессии' });
    }
  });
  
  /**
   * JOIN_ROOM - присоединение к комнате
   * @param {{ roomId: string }} payload
   */
  socket.on('JOIN_ROOM', async (payload) => {
    try {
      const { roomId } = payload;
      const state = clientStates.get(socket.id);
      
      if (!state?.sessionMemberId) {
        emitWithSequence(socket, 'ERROR', { message: 'Требуется аутентификация' });
        return;
      }
      
      // Покидаем предыдущую комнату если были в ней
      if (state.currentRoomId) {
        await roomService.leaveRoom(state.currentRoomId, state.sessionMemberId);
        socket.to(state.currentRoomId).emit('GATEWAY_EVENT', {
          t: 'MEMBER_LEAVE',
          d: { roomId: state.currentRoomId, memberId: state.sessionMemberId },
        });
      }
      
      // Присоединяемся к новой комнате
      const result = await roomService.joinRoom(roomId, state.sessionMemberId);
      
      if (result.joined) {
        state.currentRoomId = roomId;
        
        // Получаем актуальное состояние комнаты
        const roomState = await roomService.getRoomWithMembers(roomId);
        
        // Отправляем подтверждение и состояние комнаты
        emitWithSequence(socket, 'ROOM_JOINED', {
          roomId,
          room: roomState,
        });
        
        // Уведомляем других участников комнаты
        socket.to(roomId).emit('GATEWAY_EVENT', {
          t: 'MEMBER_JOIN',
          d: {
            roomId,
            member: {
              id: state.sessionMemberId,
              userId: state.user.id,
              username: state.user.username,
              avatar: state.user.avatar,
            },
          },
        });
        
        // Подключаем сокет к комнате для broadcast
        socket.join(roomId);
      }
    } catch (error) {
      console.error('Ошибка JOIN_ROOM:', error);
      emitWithSequence(socket, 'ERROR', { message: 'Ошибка при входе в комнату' });
    }
  });
  
  /**
   * VOICE_STATE_UPDATE - обновление голосового состояния
   * @param {{ roomId?: string, mute?: boolean, deaf?: boolean, speaking?: boolean }} payload
   */
  socket.on('VOICE_STATE_UPDATE', async (payload) => {
    try {
      const state = clientStates.get(socket.id);
      
      if (!state?.sessionMemberId) {
        emitWithSequence(socket, 'ERROR', { message: 'Требуется аутентификация' });
        return;
      }
      
      const result = await voiceService.updateVoiceState(state.sessionMemberId, {
        muted: payload.mute,
        deafened: payload.deaf,
        speaking: payload.speaking,
      });
      
      if (result.updated) {
        // Отправляем обновление всем в текущей комнате
        const roomId = state.currentRoomId || payload.roomId;
        if (roomId) {
          io.to(roomId).emit('GATEWAY_EVENT', {
            t: 'VOICE_STATE_UPDATE',
            d: {
              roomId,
              memberId: state.sessionMemberId,
              muted: result.member.muted,
              deafened: result.member.deafened,
              speaking: result.member.speaking,
            },
          });
        }
      }
    } catch (error) {
      console.error('Ошибка VOICE_STATE_UPDATE:', error);
      emitWithSequence(socket, 'ERROR', { message: 'Ошибка обновления голосового состояния' });
    }
  });
  
  /**
   * LEAVE_ROOM - покинуть текущую комнату
   */
  socket.on('LEAVE_ROOM', async () => {
    const state = clientStates.get(socket.id);
    
    if (!state?.currentRoomId || !state.sessionMemberId) {
      return;
    }
    
    const roomId = state.currentRoomId;
    await roomService.leaveRoom(roomId, state.sessionMemberId);
    
    socket.to(roomId).emit('GATEWAY_EVENT', {
      t: 'MEMBER_LEAVE',
      d: { roomId, memberId: state.sessionMemberId },
    });
    
    socket.leave(roomId);
    state.currentRoomId = null;
    
    emitWithSequence(socket, 'ROOM_LEFT', { roomId });
  });
  
  /**
   * SYNC_REQUEST - запрос синхронизации состояния
   */
  socket.on('SYNC_REQUEST', async () => {
    const state = clientStates.get(socket.id);
    
    if (!state?.sessionMemberId) {
      return;
    }
    
    // Получаем актуальное состояние
    const member = await prisma.sessionMember.findUnique({
      where: { id: state.sessionMemberId },
      include: {
        session: {
          include: {
            rooms: {
              include: {
                members: {
                  include: {
                    sessionMember: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    
    if (member) {
      const rooms = member.session.rooms.map(room => ({
        id: room.id,
        name: room.name,
        type: room.type,
        members: room.members.map(m => ({
          id: m.sessionMember.id,
          userId: m.sessionMember.userId,
          username: m.sessionMember.user.username,
          avatar: m.sessionMember.user.avatar,
          muted: m.sessionMember.muted,
          deafened: m.sessionMember.deafened,
          speaking: m.sessionMember.speaking,
        })),
      }));
      
      emitWithSequence(socket, 'SYNC_COMPLETE', { rooms });
    }
  });
  
  /**
   * Обработка отключения
   */
  socket.on('disconnect', () => {
    const state = clientStates.get(socket.id);
    
    if (state) {
      // Очищаем heartbeat
      if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
      }
      
      // Если был в комнате - уведомляем участников
      if (state.currentRoomId && state.sessionMemberId) {
        io.to(state.currentRoomId).emit('GATEWAY_EVENT', {
          t: 'MEMBER_LEAVE',
          d: {
            roomId: state.currentRoomId,
            memberId: state.sessionMemberId,
            disconnected: true,
          },
        });
      }
      
      clientStates.delete(socket.id);
    }
    
    console.log(`🔌 Клиент отключен: ${socket.id}`);
  });
}

/**
 * Запуск heartbeat для поддержания соединения
 */
function startHeartbeat(socket) {
  const state = clientStates.get(socket.id);
  
  if (state.heartbeatInterval) {
    clearInterval(state.heartbeatInterval);
  }
  
  state.heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      emitWithSequence(socket, 'HEARTBEACK_ACK', {
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
      });
    }
  }, config.ws.heartbeatInterval);
}

// Создаем экземпляр Socket.io
let io;

/**
 * Инициализация Gateway
 */
function initGateway(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: config.ws.pingTimeout,
    pingInterval: 25000,
  });
  
  io.on('connection', handleConnection);
  
  console.log(`🚀 Gateway запущен на порту ${config.port}`);
  
  return io;
}

/**
 * Экспорт для использования в других модулях
 */
function getIO() {
  return io;
}

module.exports = {
  initGateway,
  getIO,
  emitWithSequence,
};
