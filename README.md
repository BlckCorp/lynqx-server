# Lynqx | Голосовой сервис для кооп-игр

Discord-like система реального времени с модульным клиентом на Tauri v2 + Vanilla ESM.

## 📁 Структура проекта

```
/workspace
├── server/                 # Серверная часть (Node.js + Socket.io)
│   ├── prisma/            # Prisma схема и миграции
│   ├── src/
│   │   ├── config/        # Конфигурация
│   │   ├── db/            # База данных (Prisma)
│   │   ├── gateway/       # WebSocket Gateway
│   │   ├── api/           # REST API
│   │   └── services/      # Бизнес-логика
│   └── Dockerfile
├── client/                 # Клиентская часть (Vanilla JS ESM)
│   ├── src/
│   │   ├── core/          # EventBus, ModuleRegistry
│   │   └── modules/       # UI модули (lobby, chat, voice-panel, settings)
│   └── tauri.conf.json
├── docker/
│   └── docker-compose.yml
├── .env.example
└── README.md
```

## 🚀 Быстрый старт

### Локальный запуск (Docker)

```bash
# 1. Скопируйте .env.example в .env
cp .env.example .env

# 2. Запустите сервер и БД
cd docker
docker compose up -d

# 3. Проверьте статус
docker compose ps

# 4. Проверьте health endpoint
curl http://localhost:3000/api/health
# Ответ: {"status":"ok","database":"connected",...}
```

### Локальная разработка (без Docker)

```bash
# Сервер
cd server
npm install
npx prisma migrate dev
npm run dev

# Клиент (в другом терминале)
cd client
npm install
npm run dev
```

## 🔧 Перенос на VPS

```bash
# 1. Клонируйте репозиторий на VPS
git clone <repo-url> lynqx
cd lynqx

# 2. Настройте .env для продакшена
cp .env.example .env
# Отредактируйте: NODE_ENV=production, пароли, порты

# 3. Запустите через Docker Compose
cd docker
docker compose up -d --build

# 4. Проверьте логи
docker compose logs -f app
```

## 📡 Контракты событий (WebSocket)

### Клиент → Сервер
| Событие | Данные | Описание |
|---------|--------|----------|
| `IDENTIFY` | `{ token }` | Аутентификация |
| `RESUME` | `{ token, seq }` | Восстановление сессии |
| `JOIN_ROOM` | `{ roomId }` | Вход в комнату |
| `VOICE_STATE_UPDATE` | `{ roomId, mute, deaf, speaking }` | Голосовое состояние |
| `LEAVE_ROOM` | `-` | Выход из комнаты |
| `SYNC_REQUEST` | `-` | Запрос синхронизации |

### Сервер → Клиент
| Событие | Данные | Описание |
|---------|--------|----------|
| `READY` | `{ user, sessions }` | Успешная аутентификация |
| `ROOM_JOINED` | `{ roomId, room }` | Успешный вход в комнату |
| `ROOM_LEFT` | `{ roomId }` | Выход из комнаты |
| `MEMBER_JOIN` | `{ roomId, member }` | Участник вошёл |
| `MEMBER_LEAVE` | `{ roomId, memberId }` | Участник вышел |
| `VOICE_STATE_UPDATE` | `{ roomId, memberId, muted, deafened, speaking }` | Обновление статуса |
| `MESSAGE_CREATE` | `{ roomId, message }` | Новое сообщение |
| `SYNC_COMPLETE` | `{ rooms }` | Результат синхронизации |
| `HEARTBEACK_ACK` | `{ timestamp }` | Подтверждение heartbeat |
| `RESUME_COMPLETE` | `{ fromSequence, toSequence }` | Сессия восстановлена |

## ✅ Проверка функциональности

### 1. Health check
```bash
curl http://localhost:3000/api/health
```

### 2. Тест RESUME (восстановление сессии)
```javascript
// В консоли браузера:
lynqx.state.lastSequence = 100;
lynqx.socket.close();
// Через несколько секунд проверьте событие RESUME_COMPLETE
```

### 3. Переключение комнат
- Кликните на комнату в Lobby
- UI должен обновиться мгновенно без мерцания
- Данные подгружаются фоном

### 4. Ошибка в mount() модуля
```javascript
// Модуль с ошибкой не сломает остальные
// Ошибка логируется, другие модули работают
```

## 🧩 Добавление нового модуля

1. Создайте папку модуля:
```bash
mkdir client/src/modules/my-module
```

2. Создайте `index.js`:
```javascript
import { eventBus } from '../../core/event-bus.js';

export default class MyModule {
  constructor({ eventBus, config }) {
    this.eventBus = eventBus;
    this.config = config;
  }

  async mount() {
    console.log('[MyModule] Монтирование');
    // Инициализация
  }

  async unmount() {
    console.log('[MyModule] Демонтирование');
    // Cleanup
  }
}
```

3. Зарегистрируйте в `client/src/main.js`:
```javascript
moduleRegistry.register('my-module', {
  name: 'My Module',
  path: './modules/my-module/index.js',
  autoLoad: true,
});
```

## 🐛 Отладка WS-событий

```javascript
// В консоли браузера:
window.lynqx.eventBus.on('gateway:*', (data, event) => {
  console.log('📨 Событие:', event, data);
});

// Отправить событие вручную:
window.lynqx.sendEvent('VOICE_STATE_UPDATE', { mute: true });

// Посмотреть состояние:
console.log(window.lynqx.state);
```

## ⚙️ Конфигурация

Все настройки через `.env`. Никаких `process.env` в бизнес-логике.

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | 3000 | Порт сервера |
| `DATABASE_URL` | postgresql://... | Подключение к БД |
| `WS_HEARTBEAT_INTERVAL` | 30000 | Интервал heartbeat (мс) |
| `CORS_ORIGIN` | * | Разрешённые origins |
| `LOG_LEVEL` | info | Уровень логирования |

## 📝 Допущения

1. **Аутентификация**: Используется простая токеновая система. В продакшене заменить на JWT/OAuth.
2. **Голосовая связь**: Реализован только трекинг состояния (muted/deafened/speaking). Медиа-стриминг не включён.
3. **Хранение сообщений**: Сообщения сохраняются в БД, но история не paginateруется в MVP.
4. **Масштабирование**: Single-instance сервер. Для кластера нужен Redis adapter для Socket.io.
5. **Клиент**: Vanilla JS без фреймворков. Tauri v2 используется только как обёртка.

## 📄 Лицензия

MIT
