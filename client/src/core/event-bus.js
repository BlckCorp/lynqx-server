/**
 * EventBus - центральная шина событий для модулей
 * Модули общаются только через EventBus, прямые импорты запрещены
 */

class EventBus {
  constructor() {
    this.listeners = new Map(); // event -> Set<callback>
    this.onceListeners = new Map(); // event -> Set<callback>
  }

  /**
   * Подписаться на событие
   * @param {string} event - имя события
   * @param {Function} callback - функция обработчика
   * @returns {Function} - функция отписки
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Возвращаем функцию отписки
    return () => this.off(event, callback);
  }

  /**
   * Подписаться на событие однократно
   * @param {string} event 
   * @param {Function} callback 
   * @returns {Function}
   */
  once(event, callback) {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event).add(callback);
    
    return () => this.offOnce(event, callback);
  }

  /**
   * Отписаться от события
   * @param {string} event 
   * @param {Function} callback 
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Отписаться от однократного события
   * @param {string} event 
   * @param {Function} callback 
   */
  offOnce(event, callback) {
    if (this.onceListeners.has(event)) {
      this.onceListeners.get(event).delete(callback);
    }
  }

  /**
   * Отписаться от всех событий (для cleanup)
   * @param {string} [event] - если не указан, очищает все
   */
  offAll(event) {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Испустить событие
   * @param {string} event - имя события
   * @param {any} data - данные события
   * @returns {Promise<void>}
   */
  async emit(event, data) {
    const listeners = this.listeners.get(event) || new Set();
    const onceListeners = this.onceListeners.get(event) || new Set();
    
    // Сначала обрабатываем once listeners
    for (const callback of onceListeners) {
      try {
        await callback(data, event);
      } catch (error) {
        console.error(`[EventBus] Ошибка в once обработчике "${event}":`, error);
      }
    }
    this.onceListeners.delete(event);
    
    // Затем обычные listeners
    for (const callback of listeners) {
      try {
        await callback(data, event);
      } catch (error) {
        console.error(`[EventBus] Ошибка в обработчике "${event}":`, error);
        // Не прерываем обработку остальных
      }
    }
  }

  /**
   * Испустить событие синхронно
   * @param {string} event 
   * @param {any} data 
   */
  emitSync(event, data) {
    const listeners = this.listeners.get(event) || new Set();
    const onceListeners = this.onceListeners.get(event) || new Set();
    
    for (const callback of onceListeners) {
      try {
        callback(data, event);
      } catch (error) {
        console.error(`[EventBus] Ошибка в once обработчике "${event}":`, error);
      }
    }
    this.onceListeners.delete(event);
    
    for (const callback of listeners) {
      try {
        callback(data, event);
      } catch (error) {
        console.error(`[EventBus] Ошибка в обработчике "${event}":`, error);
      }
    }
  }

  /**
   * Получить количество слушателей события
   * @param {string} event 
   * @returns {number}
   */
  listenerCount(event) {
    const count = (this.listeners.get(event)?.size || 0) +
                  (this.onceListeners.get(event)?.size || 0);
    return count;
  }
}

// Singleton экземпляр
const eventBus = new EventBus();

module.exports = {
  EventBus,
  eventBus,
};
