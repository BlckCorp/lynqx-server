/**
 * Модуль Lobby - список сессий и комнат
 * Контракт: mount(), unmount(), renderSessions(), renderRooms()
 */

import { eventBus } from '../../core/event-bus.js';

export default class LobbyModule {
  constructor({ eventBus, config }) {
    this.eventBus = eventBus;
    this.config = config;
    this.container = null;
    this.state = {
      sessions: [],
      currentSessionId: null,
      currentRoomId: null,
    };
    
    // Привязываем методы
    this._handleReady = this._handleReady.bind(this);
    this._handleRoomUpdate = this._handleRoomUpdate.bind(this);
  }

  /**
   * Инициализация модуля
   */
  async mount() {
    console.log('[Lobby] Монтирование модуля');
    
    // Создаем контейнер
    this.container = document.createElement('div');
    this.container.id = 'lobby-module';
    this.container.className = 'module-container';
    
    // Загружаем стили
    await this._loadStyles();
    
    // Подписываемся на события
    this.eventBus.on('gateway:READY', this._handleReady);
    this.eventBus.on('gateway:ROOM_CREATE', this._handleRoomUpdate);
    this.eventBus.on('gateway:ROOM_UPDATE', this._handleRoomUpdate);
    this.eventBus.on('gateway:MEMBER_JOIN', this._handleMemberUpdate);
    this.eventBus.on('gateway:MEMBER_LEAVE', this._handleMemberUpdate);
    
    // Рендерим начальный UI
    this._render();
    
    // Добавляем в DOM
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.appendChild(this.container);
    }
    
    console.log('[Lobby] Модуль смонтирован');
  }

  /**
   * Очистка модуля
   */
  async unmount() {
    console.log('[Lobby] Демонтирование модуля');
    
    // Отписываемся от событий
    this.eventBus.off('gateway:READY', this._handleReady);
    this.eventBus.off('gateway:ROOM_CREATE', this._handleRoomUpdate);
    this.eventBus.off('gateway:ROOM_UPDATE', this._handleRoomUpdate);
    this.eventBus.off('gateway:MEMBER_JOIN', this._handleMemberUpdate);
    this.eventBus.off('gateway:MEMBER_LEAVE', this._handleMemberUpdate);
    
    // Удаляем из DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.container = null;
    console.log('[Lobby] Модуль демонтирован');
  }

  /**
   * Обработчик события READY от сервера
   */
  _handleReady(data) {
    console.log('[Lobby] Получено событие READY', data);
    this.state.sessions = data.sessions || [];
    if (data.sessions.length > 0) {
      this.state.currentSessionId = data.sessions[0].id;
    }
    this._render();
  }

  /**
   * Обработчик обновления комнаты
   */
  _handleRoomUpdate(data) {
    console.log('[Lobby] Обновление комнаты', data);
    // Находим и обновляем комнату в state
    // В реальной реализации здесь была бы более сложная логика
    this._render();
  }

  /**
   * Обработчик обновления участников
   */
  _handleMemberUpdate(data) {
    console.log('[Lobby] Обновление участников', data);
    this._render();
  }

  /**
   * Загрузка CSS стилей
   */
  async _loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './modules/lobby/styles.css';
    document.head.appendChild(link);
  }

  /**
   * Основной рендер
   */
  _render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="lobby-header">
        <h2>🎮 Сессии</h2>
      </div>
      <div class="sessions-list">
        ${this._renderSessions()}
      </div>
      <div class="rooms-panel">
        ${this._renderRooms()}
      </div>
    `;
    
    // Навешиваем обработчики событий
    this._attachEventListeners();
  }

  /**
   * Рендер списка сессий
   */
  _renderSessions() {
    if (!this.state.sessions || this.state.sessions.length === 0) {
      return '<p class="empty-state">Нет доступных сессий</p>';
    }
    
    return this.state.sessions.map(session => `
      <div class="session-item ${session.id === this.state.currentSessionId ? 'active' : ''}" 
           data-session-id="${session.id}">
        <div class="session-name">${this._escapeHtml(session.name)}</div>
        <div class="session-info">
          <span class="room-count">${session.rooms?.length || 0} комнат</span>
          <span class="member-count">${session.memberCount || '?'} участников</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * Рендер списка комнат
   */
  _renderRooms() {
    const currentSession = this.state.sessions.find(
      s => s.id === this.state.currentSessionId
    );
    
    if (!currentSession) {
      return '<p class="empty-state">Выберите сессию</p>';
    }
    
    const rooms = currentSession.rooms || [];
    
    return `
      <div class="rooms-header">
        <h3>📍 Комнаты</h3>
        <button class="btn-create-room" title="Создать комнату">+</button>
      </div>
      <div class="rooms-list">
        ${rooms.map(room => `
          <div class="room-item ${room.type}" 
               data-room-id="${room.id}"
               data-room-type="${room.type}">
            <span class="room-icon">${room.type === 'VOICE' ? '🔊' : '💬'}</span>
            <span class="room-name">${this._escapeHtml(room.name)}</span>
            <span class="room-members">${room.members?.length || 0}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Навешивание обработчиков событий DOM
   */
  _attachEventListeners() {
    // Клик по сессии
    this.container.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const sessionId = e.currentTarget.dataset.sessionId;
        this.state.currentSessionId = sessionId;
        this._render();
        this.eventBus.emit('lobby:sessionSelected', { sessionId });
      });
    });
    
    // Клик по комнате
    this.container.querySelectorAll('.room-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const roomId = e.currentTarget.dataset.roomId;
        const roomType = e.currentTarget.dataset.roomType;
        this.state.currentRoomId = roomId;
        
        // Уведомляем о выборе комнаты
        this.eventBus.emit('lobby:roomSelected', { roomId, roomType });
      });
    });
    
    // Кнопка создания комнаты
    const createBtn = this.container.querySelector('.btn-create-room');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.eventBus.emit('lobby:createRoomRequested', {
          sessionId: this.state.currentSessionId,
        });
      });
    }
  }

  /**
   * Экранирование HTML для безопасности
   */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
