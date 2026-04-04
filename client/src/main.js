/**
 * Lynqx Client - главное приложение
 * Инициализация WebSocket, синхронизация, загрузка модулей
 */

import { eventBus } from './core/event-bus.js';
import { ModuleRegistry } from './core/module-registry.js';

// Глобальное состояние
const appState = {
  socket: null,
  user: null,
  token: null,
  lastSequence: 0,
  isConnected: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
};

// Создаем реестр модулей
const moduleRegistry = new ModuleRegistry(eventBus);

/**
 * Инициализация WebSocket подключения
 */
function initWebSocket() {
  const serverUrl = localStorage.getItem('lynqx_server_url') || 'ws://localhost:3000';
  
  console.log('[Client] Подключение к', serverUrl);
  
  appState.socket = new WebSocket(serverUrl);
  
  appState.socket.onopen = () => {
    console.log('[Client] WebSocket подключен');
    appState.isConnected = true;
    appState.reconnectAttempts = 0;
    eventBus.emitSync('gateway:connected', {});
    
    // Отправляем IDENTIFY с токеном
    const token = localStorage.getItem('lynqx_token');
    if (token) {
      sendEvent('IDENTIFY', { token });
    }
  };
  
  appState.socket.onclose = (event) => {
    console.log('[Client] WebSocket отключен', event.code, event.reason);
    appState.isConnected = false;
    eventBus.emitSync('gateway:disconnected', {});
    
    // Пытаемся переподключиться
    if (appState.reconnectAttempts < appState.maxReconnectAttempts) {
      appState.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, appState.reconnectAttempts), 30000);
      console.log(`[Client] Переподключение через ${delay}мс (попытка ${appState.reconnectAttempts})`);
      setTimeout(initWebSocket, delay);
    } else {
      console.error('[Client] Превышено количество попыток переподключения');
    }
  };
  
  appState.socket.onerror = (error) => {
    console.error('[Client] WebSocket ошибка:', error);
  };
  
  appState.socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleGatewayMessage(message);
    } catch (error) {
      console.error('[Client] Ошибка парсинга сообщения:', error);
    }
  };
}

/**
 * Обработка сообщений от Gateway
 */
function handleGatewayMessage(message) {
  const { t: type, d: data, s: sequence } = message;
  
  // Обновляем последовательность
  if (sequence) {
    appState.lastSequence = sequence;
  }
  
  console.log('[Client] Получено событие:', type, data);
  
  // Испускаем событие через EventBus
  eventBus.emitSync(`gateway:${type}`, data);
  
  // Специальная обработка некоторых событий
  switch (type) {
    case 'READY':
      handleReady(data);
      break;
    case 'RESUME_COMPLETE':
      handleResumeComplete(data);
      break;
    case 'HEARTBEACK_ACK':
      // Сервер жив, можно сбросить таймер
      break;
  }
}

/**
 * Обработчик события READY
 */
function handleReady(data) {
  console.log('[Client] READY получено', data);
  appState.user = data.user;
  appState.token = localStorage.getItem('lynqx_token');
  
  // Сохраняем данные сессии
  sessionStorage.setItem('lynqx_sessions', JSON.stringify(data.sessions));
}

/**
 * Обработчик RESUME_COMPLETE
 */
function handleResumeComplete(data) {
  console.log('[Client] Сессия восстановлена', data);
}

/**
 * Отправка события на сервер
 */
function sendEvent(type, data) {
  if (!appState.socket || appState.socket.readyState !== WebSocket.OPEN) {
    console.warn('[Client] Нельзя отправить событие - нет подключения');
    return false;
  }
  
  const message = JSON.stringify({ t: type, d: data });
  appState.socket.send(message);
  console.log('[Client] Отправлено:', type, data);
  return true;
}

/**
 * Восстановление сессии после переподключения
 */
function resumeSession() {
  const token = localStorage.getItem('lynqx_token');
  if (token && appState.lastSequence > 0) {
    console.log('[Client] Попытка восстановления сессии, seq=', appState.lastSequence);
    sendEvent('RESUME', { token, seq: appState.lastSequence });
  } else if (token) {
    console.log('[Client] Полная аутентификация');
    sendEvent('IDENTIFY', { token });
  }
}

/**
 * Регистрация модулей
 */
function registerModules() {
  // Lobby модуль
  moduleRegistry.register('lobby', {
    name: 'Lobby',
    path: './modules/lobby/index.js',
    autoLoad: true,
  });
  
  // Chat модуль
  moduleRegistry.register('chat', {
    name: 'Chat',
    path: './modules/chat/index.js',
    autoLoad: true,
    dependencies: ['lobby'],
  });
  
  // Voice Panel модуль
  moduleRegistry.register('voice-panel', {
    name: 'Voice Panel',
    path: './modules/voice-panel/index.js',
    autoLoad: true,
    dependencies: ['lobby'],
  });
  
  // Settings модуль
  moduleRegistry.register('settings', {
    name: 'Settings',
    path: './modules/settings/index.js',
    autoLoad: true,
  });
}

/**
 * Настройка глобальных обработчиков событий
 */
function setupEventHandlers() {
  // Обработка выбора комнаты из Lobby
  eventBus.on('lobby:roomSelected', async (data) => {
    console.log('[Client] Выбор комнаты:', data);
    sendEvent('JOIN_ROOM', { roomId: data.roomId });
  });
  
  // Обработка голосовых обновлений
  eventBus.on('gateway:VOICE_STATE_UPDATE', (data) => {
    sendEvent('VOICE_STATE_UPDATE', data);
  });
  
  // Обработка выхода из комнаты
  eventBus.on('gateway:LEAVE_ROOM', () => {
    sendEvent('LEAVE_ROOM', {});
  });
  
  // Обработка изменений настроек
  eventBus.on('settings:changed', (data) => {
    console.log('[Client] Настройки изменены:', data);
    // При изменении URL сервера нужно переподключиться
    if (data.serverUrl) {
      appState.socket?.close();
      setTimeout(initWebSocket, 500);
    }
  });
}

/**
 * Инициализация приложения
 */
async function init() {
  console.log('[Client] Lynqx Client запускается...');
  
  // Регистрируем модули
  registerModules();
  
  // Настраиваем обработчики событий
  setupEventHandlers();
  
  // Загружаем автозагружаемые модули
  try {
    await moduleRegistry.loadAutoModules();
    console.log('[Client] Модули загружены');
  } catch (error) {
    console.error('[Client] Ошибка загрузки модулей:', error);
  }
  
  // Инициализируем WebSocket
  initWebSocket();
  
  // Периодическая синхронизация (каждые 5 секунд)
  setInterval(() => {
    if (appState.isConnected) {
      sendEvent('SYNC_REQUEST', {});
    }
  }, 5000);
  
  console.log('[Client] Клиент готов к работе');
}

// Экспорт для отладки в консоли
window.lynqx = {
  state: appState,
  eventBus,
  moduleRegistry,
  sendEvent,
};

// Запуск при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
