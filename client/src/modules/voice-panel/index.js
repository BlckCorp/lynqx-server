/**
 * Модуль Voice Panel - управление голосовым состоянием
 * Контракт: mount(), unmount(), toggleMute(), toggleDeafen()
 */

import { eventBus } from '../../core/event-bus.js';

export default class VoicePanelModule {
  constructor({ eventBus, config }) {
    this.eventBus = eventBus;
    this.config = config;
    this.container = null;
    this.state = {
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      currentRoomId: null,
    };
    
    this._handleVoiceStateUpdate = this._handleVoiceStateUpdate.bind(this);
    this._handleRoomJoined = this._handleRoomJoined.bind(this);
  }

  async mount() {
    console.log('[VoicePanel] Монтирование модуля');
    
    this.container = document.createElement('div');
    this.container.id = 'voice-panel-module';
    this.container.className = 'module-container';
    
    await this._loadStyles();
    
    this.eventBus.on('gateway:VOICE_STATE_UPDATE', this._handleVoiceStateUpdate);
    this.eventBus.on('lobby:roomSelected', this._handleRoomJoined);
    
    this._render();
    
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.appendChild(this.container);
    }
    
    // Запускаем индикатор говорения (симуляция)
    this._startSpeakingDetector();
    
    console.log('[VoicePanel] Модуль смонтирован');
  }

  async unmount() {
    console.log('[VoicePanel] Демонтирование модуля');
    
    this.eventBus.off('gateway:VOICE_STATE_UPDATE', this._handleVoiceStateUpdate);
    this.eventBus.off('lobby:roomSelected', this._handleRoomJoined);
    
    if (this._speakingInterval) {
      clearInterval(this._speakingInterval);
    }
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.container = null;
    console.log('[VoicePanel] Модуль демонтирован');
  }

  _handleVoiceStateUpdate(data) {
    console.log('[VoicePanel] Обновление голосового состояния', data);
    // Обновляем состояние только для текущего пользователя
    // В реальной реализации нужна идентификация пользователя
    this._render();
  }

  _handleRoomJoined(data) {
    console.log('[VoicePanel] Присоединение к комнате', data);
    this.state.currentRoomId = data.roomId;
    this._render();
  }

  async _loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './modules/voice-panel/styles.css';
    document.head.appendChild(link);
  }

  _render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="voice-panel">
        <div class="voice-status ${this.state.currentRoomId ? 'connected' : ''}">
          <span class="status-indicator"></span>
          <span class="status-text">${this.state.currentRoomId ? 'В комнате' : 'Не подключено'}</span>
        </div>
        <div class="voice-controls">
          <button 
            class="control-btn mute-btn ${this.state.isMuted ? 'active' : ''}"
            id="btn-mute"
            title="${this.state.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}"
          >
            <span class="icon">${this.state.isMuted ? '🔇' : '🎤'}</span>
          </button>
          <button 
            class="control-btn deafen-btn ${this.state.isDeafened ? 'active' : ''}"
            id="btn-deafen"
            title="${this.state.isDeafened ? 'Включить звук' : 'Отключить звук'}"
          >
            <span class="icon">${this.state.isDeafened ? '🔇' : '🎧'}</span>
          </button>
          <button 
            class="control-btn leave-btn"
            id="btn-leave"
            title="Покинуть комнату"
            ${!this.state.currentRoomId ? 'disabled' : ''}
          >
            <span class="icon">📴</span>
          </button>
        </div>
        ${this.state.isSpeaking ? '<div class="speaking-indicator">Говорите...</div>' : ''}
      </div>
    `;
    
    this._attachEventListeners();
  }

  _attachEventListeners() {
    const muteBtn = this.container.querySelector('#btn-mute');
    const deafenBtn = this.container.querySelector('#btn-deafen');
    const leaveBtn = this.container.querySelector('#btn-leave');
    
    if (muteBtn) {
      muteBtn.addEventListener('click', () => this.toggleMute());
    }
    
    if (deafenBtn) {
      deafenBtn.addEventListener('click', () => this.toggleDeafen());
    }
    
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => this.leaveRoom());
    }
  }

  toggleMute() {
    this.state.isMuted = !this.state.isMuted;
    console.log('[VoicePanel] Mute:', this.state.isMuted);
    
    this.eventBus.emit('gateway:VOICE_STATE_UPDATE', {
      roomId: this.state.currentRoomId,
      mute: this.state.isMuted,
    });
    
    this._render();
  }

  toggleDeafen() {
    this.state.isDeafened = !this.state.isDeafened;
    console.log('[VoicePanel] Deafen:', this.state.isDeafened);
    
    this.eventBus.emit('gateway:VOICE_STATE_UPDATE', {
      roomId: this.state.currentRoomId,
      deaf: this.state.isDeafened,
    });
    
    this._render();
  }

  leaveRoom() {
    console.log('[VoicePanel] Покидаем комнату');
    this.eventBus.emit('gateway:LEAVE_ROOM', {});
    this.state.currentRoomId = null;
    this._render();
  }

  _startSpeakingDetector() {
    // Симуляция детекции голоса
    // В реальной реализации здесь будет Web Audio API
    this._speakingInterval = setInterval(() => {
      // Случайная симляция speaking статуса
      if (this.state.currentRoomId && !this.state.isMuted) {
        const wasSpeaking = this.state.isSpeaking;
        this.state.isSpeaking = Math.random() > 0.7;
        
        if (wasSpeaking !== this.state.isSpeaking) {
          this.eventBus.emit('gateway:VOICE_STATE_UPDATE', {
            roomId: this.state.currentRoomId,
            speaking: this.state.isSpeaking,
          });
          this._render();
        }
      }
    }, 1000);
  }
}
