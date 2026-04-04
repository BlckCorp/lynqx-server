/**
 * ModuleRegistry - реестр и загрузчик модулей
 * Динамический import(), управление жизненным циклом модулей
 */

class ModuleRegistry {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.modules = new Map(); // moduleId -> moduleInstance
    this.moduleConfigs = new Map(); // moduleId -> config
  }

  /**
   * Зарегистрировать конфигурацию модуля
   * @param {string} id - уникальный ID модуля
   * @param {Object} config - { path, name, dependencies?, autoLoad? }
   */
  register(id, config) {
    if (this.moduleConfigs.has(id)) {
      console.warn(`[ModuleRegistry] Модуль "${id}" уже зарегистрирован`);
      return;
    }

    this.moduleConfigs.set(id, {
      id,
      loaded: false,
      error: null,
      ...config,
    });
  }

  /**
   * Загрузить модуль по ID
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async load(id) {
    const config = this.moduleConfigs.get(id);
    
    if (!config) {
      throw new Error(`Модуль "${id}" не зарегистрирован`);
    }

    if (this.modules.has(id)) {
      console.log(`[ModuleRegistry] Модуль "${id}" уже загружен`);
      return this.modules.get(id);
    }

    try {
      // Динамический импорт модуля
      const modulePath = config.path;
      const moduleExports = await import(modulePath);
      
      const ModuleClass = moduleExports.default;
      
      if (!ModuleClass) {
        throw new Error(`Модуль "${id}" не экспортирует класс по умолчанию`);
      }

      // Создаем экземпляр модуля
      const instance = new ModuleClass({
        eventBus: this.eventBus,
        config: config.options || {},
      });

      // Проверяем зависимости
      if (config.dependencies) {
        for (const depId of config.dependencies) {
          if (!this.modules.has(depId)) {
            await this.load(depId);
          }
        }
      }

      // Вызываем mount (инициализация)
      if (instance.mount) {
        await instance.mount();
      }

      // Сохраняем экземпляр
      this.modules.set(id, instance);
      config.loaded = true;

      console.log(`✅ Модуль "${id}" загружен`);

      // Уведомляем о загрузке
      this.eventBus.emitSync('module:loaded', { id, instance });

      return instance;
    } catch (error) {
      config.error = error.message;
      config.loaded = false;
      
      console.error(`❌ Ошибка загрузки модуля "${id}":`, error);
      
      // Уведомляем об ошибке
      this.eventBus.emitSync('module:error', { id, error });
      
      throw error;
    }
  }

  /**
   * Загрузить все автозагружаемые модули
   * @returns {Promise<void>}
   */
  async loadAutoModules() {
    const autoLoadModules = [...this.moduleConfigs.entries()]
      .filter(([, config]) => config.autoLoad !== false);

    for (const [id, config] of autoLoadModules) {
      try {
        await this.load(id);
      } catch (error) {
        // Продолжаем загрузку остальных модулей
        console.warn(`Пропускаем модуль "${id}" из-за ошибки`);
      }
    }
  }

  /**
   * Получить экземпляр модуля
   * @param {string} id 
   * @returns {Object|null}
   */
  get(id) {
    return this.modules.get(id) || null;
  }

  /**
   * Проверить, загружен ли модуль
   * @param {string} id 
   * @returns {boolean}
   */
  isLoaded(id) {
    return this.modules.has(id);
  }

  /**
   * Выгрузить модуль
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  async unload(id) {
    const instance = this.modules.get(id);
    const config = this.moduleConfigs.get(id);

    if (!instance) {
      return false;
    }

    try {
      // Вызываем unmount (cleanup)
      if (instance.unmount) {
        await instance.unmount();
      }

      // Удаляем экземпляр
      this.modules.delete(id);
      config.loaded = false;

      console.log(`🗑️  Модуль "${id}" выгружен`);

      // Уведомляем о выгрузке
      this.eventBus.emitSync('module:unloaded', { id });

      return true;
    } catch (error) {
      console.error(`Ошибка при выгрузке модуля "${id}":`, error);
      return false;
    }
  }

  /**
   * Выгрузить все модули
   * @returns {Promise<void>}
   */
  async unloadAll() {
    const unloadPromises = [...this.modules.keys()].map(id => this.unload(id));
    await Promise.all(unloadPromises);
    this.modules.clear();
  }

  /**
   * Получить список всех зарегистрированных модулей
   * @returns {Array<Object>}
   */
  listModules() {
    return [...this.moduleConfigs.entries()].map(([id, config]) => ({
      id,
      name: config.name,
      loaded: config.loaded,
      error: config.error,
      autoLoad: config.autoLoad,
    }));
  }
}

module.exports = { ModuleRegistry };
