/**
 * Модуль Settings - настройки приложения
 * Контракт: mount(), unmount()
 */

import { eventBus } from '../../core/event-bus.js';

export default class SettingsModule {
  constructor({ eventBus, config }) {
    this.eventBus = eventBus;
    this.config = config;
    this.container = null;
    this.state = {
      username: 'Guest',
      serverUrl: localStorage.getItem('lynqx_server_url') || 'ws://localhost:3000',
      autoConnect: localStorage.getItem('lynqx_auto_connect') === 'true',
    };
  }

  async mount() {
    console.log('[Settings] Монтирование модуля');
    
    this.container = document.createElement('div');
    this.container.id = 'settings-module';
    this.container.className = 'module-container';
    
    await this._loadStyles();
    this._render();
    
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.appendChild(this.container);
    }
    
    console.log('[Settings] Модуль смонтирован');
  }

  async unmount() {
    console.log('[Settings] Демонтирование модуля');
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.container = null;
    console.log('[Settings] Модуль демонтирован');
  }

  async _loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './modules/settings/styles.css';
    document.head.appendChild(link);
  }

  _render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="settings-panel">
        <h3>⚙️ Настройки</h3>
        <div class="setting-item">
          <label for="server-url">Адрес сервера</label>
          <input type="text" id="server-url" value="${this.state.serverUrl}" />
        </div>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="auto-connect" ${this.state.autoConnect ? 'checked' : ''} />
            Автоподключение при запуске
          </label>
        </div>
        <div class="setting-item">
          <button id="save-settings" class="btn-save">Сохранить</button>
        </div>
        <div class="connection-status" id="connection-status">
          <span class="status-dot"></span>
          <span class="status-text">Отключено</span>
        </div>
      </div>
    `;
    
    this._attachEventListeners();
  }

  _attachEventListeners() {
    const saveBtn = this.container.querySelector('#save-settings');
    const serverInput = this.container.querySelector('#server-url');
    const autoConnectCheckbox = this.container.querySelector('#auto-connect');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._saveSettings());
    }
    
    if (serverInput) {
      serverInput.addEventListener('change', (e) => {
        this.state.serverUrl = e.target.value;
      });
    }
    
    if (autoConnectCheckbox) {
      autoConnectCheckbox.addEventListener('change', (e) => {
        this.state.autoConnect = e.target.checked;
      });
    }
    
    // Подписка на события подключения
    this.eventBus.on('gateway:connected', () => this._updateConnectionStatus(true));
    this.eventBus.on('gateway:disconnected', () => this._updateConnectionStatus(false));
  }

  _saveSettings() {
    localStorage.setItem('lynqx_server_url', this.state.serverUrl);
    localStorage.setItem('lynqx_auto_connect', this.state.autoConnect.toString());
    
    console.log('[Settings] Настройки сохранены');
    
    // Уведомляем о необходимости переподключения
    this.eventBus.emit('settings:changed', {
      serverUrl: this.state.serverUrl,
      autoConnect: this.state.autoConnect,
    });
    
    // Визуальное подтверждение
    const saveBtn = this.container.querySelector('#save-settings');
    if (saveBtn) {
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '✓ Сохранено';
      setTimeout(() => {
        saveBtn.textContent = originalText;
      }, 2000);
    }
  }

  _updateConnectionStatus(connected) {
    const statusEl = this.container.querySelector('#connection-status');
    if (statusEl) {
      statusEl.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
      statusEl.querySelector('.status-text').textContent = connected ? 'Подключено' : 'Отключено';
    }
  }
}
