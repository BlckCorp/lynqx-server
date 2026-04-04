/**
 * Сервис управления голосовым состоянием
 * Чистая бизнес-логика, без доступа к req/socket
 */

const { prisma } = require('../db');

/**
 * Обновить голосовое состояние участника сессии
 * @param {string} sessionMemberId 
 * @param {Object} state - { muted?, deafened?, speaking? }
 * @returns {Promise<Object>}
 */
async function updateVoiceState(sessionMemberId, state) {
  const updateData = {};
  
  if (typeof state.muted === 'boolean') {
    updateData.muted = state.muted;
  }
  if (typeof state.deafened === 'boolean') {
    updateData.deafened = state.deafened;
  }
  if (typeof state.speaking === 'boolean') {
    updateData.speaking = state.speaking;
  }
  
  if (Object.keys(updateData).length === 0) {
    return { updated: false, reason: 'no_changes' };
  }
  
  const member = await prisma.sessionMember.update({
    where: { id: sessionMemberId },
    data: updateData,
    include: {
      user: true,
      rooms: {
        include: {
          room: true,
        },
      },
    },
  });
  
  return {
    updated: true,
    member: {
      id: member.id,
      userId: member.userId,
      username: member.user.username,
      avatar: member.user.avatar,
      muted: member.muted,
      deafened: member.deafened,
      speaking: member.speaking,
      rooms: member.rooms.map(r => r.room.id),
    },
  };
}

/**
 * Получить текущее голосовое состояние участника
 * @param {string} sessionMemberId 
 * @returns {Promise<Object|null>}
 */
async function getVoiceState(sessionMemberId) {
  const member = await prisma.sessionMember.findUnique({
    where: { id: sessionMemberId },
    include: {
      user: true,
      rooms: {
        include: {
          room: true,
        },
      },
    },
  });
  
  if (!member) return null;
  
  return {
    id: member.id,
    userId: member.userId,
    username: member.user.username,
    avatar: member.user.avatar,
    muted: member.muted,
    deafened: member.deafened,
    speaking: member.speaking,
    rooms: member.rooms.map(r => r.room.id),
  };
}

/**
 * Массовое обновление состояния speaking для участников комнаты
 * (используется для детекции активности голоса)
 * @param {string} roomId 
 * @param {Array<string>} speakingMemberIds 
 * @returns {Promise<number>}
 */
async function bulkUpdateSpeaking(roomId, speakingMemberIds) {
  // Сбрасываем speaking у всех участников комнаты
  await prisma.sessionMember.updateMany({
    where: {
      rooms: {
        some: { roomId },
      },
    },
    data: { speaking: false },
  });
  
  // Устанавливаем speaking=true для активных участников
  if (speakingMemberIds.length > 0) {
    await prisma.sessionMember.updateMany({
      where: {
        id: { in: speakingMemberIds },
      },
      data: { speaking: true },
    });
  }
  
  return speakingMemberIds.length;
}

module.exports = {
  updateVoiceState,
  getVoiceState,
  bulkUpdateSpeaking,
};
