/**
 * Сервис управления комнатами
 * Чистая бизнес-логика, без доступа к req/socket
 */

const { prisma } = require('../db');

/**
 * Получить комнату по ID с участниками
 * @param {string} roomId 
 * @returns {Promise<Object|null>}
 */
async function getRoomWithMembers(roomId) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      session: true,
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
  });
  
  if (!room) return null;
  
  return {
    id: room.id,
    name: room.name,
    type: room.type,
    sessionId: room.sessionId,
    config: room.config,
    members: room.members.map(m => ({
      id: m.sessionMember.id,
      userId: m.sessionMember.userId,
      username: m.sessionMember.user.username,
      avatar: m.sessionMember.user.avatar,
      role: m.sessionMember.role,
      muted: m.sessionMember.muted,
      deafened: m.sessionMember.deafened,
      speaking: m.sessionMember.speaking,
    })),
  };
}

/**
 * Создать новую комнату в сессии
 * @param {string} sessionId 
 * @param {string} name 
 * @param {'VOICE'|'TEXT'} type 
 * @param {Object} config 
 * @returns {Promise<Object>}
 */
async function createRoom(sessionId, name, type = 'VOICE', config = {}) {
  const room = await prisma.room.create({
    data: {
      sessionId,
      name,
      type,
      config,
    },
    include: {
      session: true,
    },
  });
  
  return {
    id: room.id,
    name: room.name,
    type: room.type,
    sessionId: room.sessionId,
    config: room.config,
    members: [],
  };
}

/**
 * Обновить конфигурацию комнаты
 * @param {string} roomId 
 * @param {Object} config 
 * @returns {Promise<Object|null>}
 */
async function updateRoomConfig(roomId, config) {
  const room = await prisma.room.update({
    where: { id: roomId },
    data: { config },
  });
  
  return room;
}

/**
 * Удалить комнату
 * @param {string} roomId 
 * @returns {Promise<boolean>}
 */
async function deleteRoom(roomId) {
  await prisma.room.delete({
    where: { id: roomId },
  });
  return true;
}

/**
 * Получить все комнаты сессии
 * @param {string} sessionId 
 * @returns {Promise<Array>}
 */
async function getSessionRooms(sessionId) {
  const rooms = await prisma.room.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
  
  return rooms.map(room => ({
    id: room.id,
    name: room.name,
    type: room.type,
    config: room.config,
  }));
}

/**
 * Присоединить участника к комнате
 * @param {string} roomId 
 * @param {string} sessionMemberId 
 * @returns {Promise<Object>}
 */
async function joinRoom(roomId, sessionMemberId) {
  // Проверяем, не находится ли уже участник в этой комнате
  const existing = await prisma.roomMember.findUnique({
    where: {
      roomId_sessionMemberId: {
        roomId,
        sessionMemberId,
      },
    },
  });
  
  if (existing) {
    return { joined: false, alreadyInRoom: true };
  }
  
  await prisma.roomMember.create({
    data: {
      roomId,
      sessionMemberId,
    },
  });
  
  return { joined: true };
}

/**
 * Покинуть комнату
 * @param {string} roomId 
 * @param {string} sessionMemberId 
 * @returns {Promise<boolean>}
 */
async function leaveRoom(roomId, sessionMemberId) {
  await prisma.roomMember.deleteMany({
    where: {
      roomId,
      sessionMemberId,
    },
  });
  return true;
}

module.exports = {
  getRoomWithMembers,
  createRoom,
  updateRoomConfig,
  deleteRoom,
  getSessionRooms,
  joinRoom,
  leaveRoom,
};
