/**
 * Модуль Chat - текстовые сообщения в комнатах
 * Контракт: mount(), unmount(), sendMessage(), renderMessages()
 */

import { eventBus } from '../../core/event-bus.js';

export default class ChatModule {
  constructor({ eventBus, config }) {
    this.eventBus = eventBus;
    this.config = config;
    this.container = null;
    this.state = {
      currentRoomId: null,
      messages: [],
      isConnected: false,
    };
    
    // Привязываем методы
    this._handleRoomJoined = this._handleRoomJoined.bind(this);
    this._handleMessageCreate = this._handleMessageCreate.bind(this);
  }

  async mount() {
    console.log('[Chat] Монтирование модуля');
    
    this.container = document.createElement('div');
    this.container.id = 'chat-module';
    this.container.className = 'module-container';
    
    await this._loadStyles();
    
    this.eventBus.on('lobby:roomSelected', this._handleRoomJoined);
    this.eventBus.on('gateway:MESSAGE_CREATE', this._handleMessageCreate);
    
    this._render();
    
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.appendChild(this.container);
    }
    
    console.log('[Chat] Модуль смонтирован');
  }

  async unmount() {
    console.log('[Chat] Демонтирование модуля');
    
    this.eventBus.off('lobby:roomSelected', this._handleRoomJoined);
    this.eventBus.off('gateway:MESSAGE_CREATE', this._handleMessageCreate);
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.container = null;
    console.log('[Chat] Модуль демонтирован');
  }

  _handleRoomJoined(data) {
    console.log('[Chat] Выбрана комната', data);
    this.state.currentRoomId = data.roomId;
    this.state.messages = []; // Очищаем сообщения при переключении
    this._render();
  }

  _handleMessageCreate(data) {
    console.log('[Chat] Новое сообщение', data);
    if (data.roomId === this.state.currentRoomId) {
      this.state.messages.push(data);
      this._render();
      this._scrollToBottom();
    }
  }

  async _loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './modules/chat/styles.css';
    document.head.appendChild(link);
  }

  _render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="chat-header">
        <h2>💬 Чат</h2>
        ${this.state.currentRoomId ? '<span class="room-status">● В комнате</span>' : ''}
      </div>
      <div class="messages-container" id="chat-messages">
        ${this._renderMessages()}
      </div>
      <div class="chat-input-area">
        <input 
          type="text" 
          id="chat-input" 
          placeholder="${this.state.currentRoomId ? 'Написать сообщение...' : 'Выберите комнату'}"
          ${!this.state.currentRoomId ? 'disabled' : ''}
        />
        <button id="chat-send-btn" ${!this.state.currentRoomId ? 'disabled' : ''}>➤</button>
      </div>
    `;
    
    this._attachEventListeners();
  }

  _renderMessages() {
    if (!this.state.messages || this.state.messages.length === 0) {
      return '<p class="empty-state">Нет сообщений. Будьте первыми!</p>';
    }
    
    return this.state.messages.map(msg => `
      <div class="message-item">
        <div class="message-avatar">${msg.avatar || '👤'}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-author">${this._escapeHtml(msg.username)}</span>
            <span class="message-time">${this._formatTime(msg.createdAt)}</span>
          </div>
          <div class="message-text">${this._escapeHtml(msg.content)}</div>
        </div>
      </div>
    `).join('');
  }

  _attachEventListeners() {
    const input = this.container.querySelector('#chat-input');
    const sendBtn = this.container.querySelector('#chat-send-btn');
    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this._sendMessage(input.value));
    }
    
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this._sendMessage(input.value);
        }
      });
    }
  }

  _sendMessage(content) {
    if (!content.trim() || !this.state.currentRoomId) return;
    
    // Отправляем событие на сервер через Gateway
    this.eventBus.emit('gateway:MESSAGE_CREATE', {
      roomId: this.state.currentRoomId,
      content: content.trim(),
    });
    
    // Очищаем поле ввода
    const input = this.container.querySelector('#chat-input');
    if (input) input.value = '';
  }

  _scrollToBottom() {
    const messagesContainer = this.container.querySelector('#chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
