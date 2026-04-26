# OpenCode Telegram Bridge

Integrate [OpenCode](https://opencode.ai) with Telegram to receive and respond to interactive prompts remotely.

---

## 🇷🇺 Описание (Русский)

**OpenCode Telegram Bridge** — гибридная интеграция (server plugin + standalone бот) для удалённого взаимодействия с OpenCode через Telegram:

- **Запросы разрешений** (чтение, запись, выполнение) — кнопки «Разрешить / Всегда / Отклонить»
- **Вопросы с вариантами** (`question` tool) — inline-кнопки + свой ответ
- **Остановки сессии** (idle, error) — «Продолжить» или произвольная команда
- **TUI-уведомления** — toast при потере/восстановлении связи с ботом
- **Инструмент `telegram_status`** — AI может проверить статус бота по запросу

Каждое уведомление включает **контекст** (последние сообщения агента).

### Архитектура

```
┌──────────────────────────────────────┐
│  opencode (ваша машина)               │
│  ┌──────────────────────────────────┐ │
│  │ Plugin                           │ │
│  │                                   │ │
│  │  event hook ──POST /event──────┐  │ │    Plugin ──▶ Bot
│  │                                 │  │ │    (outbound HTTPS)
│  │  polling loop ◀──GET /responses│  │ │
│  │     │                          │  │ │
│  │     ▼                          ▼  │ │
│  │  opencode API              Telegram │ │
│  │  (localhost)                Bot    │ │
│  │                             :3456  │ │
│  │  toast() ──▶ TUI                   │ │
│  │  telegram_status tool              │ │
│  └──────────────────────────────────┘ │
└──────────────────────────────────────┘

         ┌─────────────┐
         │ Docker-сервер│◀── Plugin отправляет события
         │ Telegram Bot │──▶ Plugin забирает ответы (poll)
         │  (3456)      │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Telegram App  │
         │ (ваш телефон) │
         └──────────────┘
```

**Ключевой принцип**: Бот **никогда не обращается** к opencode API напрямую. Все вызовы opencode делает plugin локально. Бот — только хранилище событий и очередь ответов.

### Установка

1. **Клонируйте:**

```bash
git clone <repo-url> && cd OCTelegramInt && npm install
```

2. **Создайте бота** через [@BotFather](https://t.me/BotFather), получите токен

3. **Узнайте Chat ID** через [@userinfobot](https://t.me/userinfobot)

4. **Сгенерируйте секрет:**

```bash
openssl rand -hex 32
```

5. **Настройте `.env`:**

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
ALLOWED_CHAT_ID=123456789
BRIDGE_SECRET=ваш_сгенерированный_секрет
```

### Запуск бота

**Docker (рекомендуется):**

```bash
docker compose up -d --build
docker compose logs -f
```

**Локально:**

```bash
npm run bot
```

### Подключение plugin к OpenCode

Добавьте в `opencode.jsonc` проекта или глобально (`~/.opencode/opencode.jsonc`):

**Удалённый бот:**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {
      "botUrl": "https://your-server.com/telegram-bridge",
      "secret": "ваш_сгенерированный_секрет"
    }]
  ]
}
```

**Локальный бот (тот же хост):**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

### Graceful Degradation

| Ситуация | Поведение |
|---|---|
| Бот доступен | Telegram + TUI работают параллельно |
| Бот недоступен | TUI работает как обычно; toast «❌ Бот недоступен» |
| Бот поднялся | Toast «⚠️ Восстановлено»; pending-ответы доставляются |
| Ответили в TUI и Telegram | Первый выигрывает; второй — ошибка (игнорируется) |
| Проверить статус | Напишите в opencode: «проверь статус телеграм бота» → AI вызовет `telegram_status` |

### Безопасность

- Plugin ↔ Bot: **Bearer token** (timing-safe comparison)
- Bot port: **127.0.0.1 только** (docker-compose)
- Chat ID фильтр на все Telegram-сообщения
- Все секреты в `.env` (в `.gitignore`)
- Pending TTL: 5 минут, toast debounce: 30 сек
- Payload limit: 1 MB

### Переменные окружения

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Да | — | Токен от @BotFather |
| `ALLOWED_CHAT_ID` | Да | — | Chat ID пользователя |
| `BOT_PORT` | Нет | `3456` | Порт HTTP-сервера |
| `BOT_HOST` | Нет | `0.0.0.0` | Хост (в Docker: `0.0.0.0`) |
| `CONTEXT_MESSAGE_COUNT` | Нет | `3` | Сообщений для контекста |
| `BRIDGE_SECRET` | Рекомендуется | — | Bearer auth plugin↔bot |

---

## 🇬🇧 Description (English)

**OpenCode Telegram Bridge** — a hybrid integration (server plugin + standalone bot) for remote interaction with OpenCode via Telegram:

- **Permission requests** (read, write, execute) — "Allow / Always / Deny" buttons
- **Questions with options** (`question` tool) — inline buttons + custom text input
- **Session stops** (idle, error) — "Continue" or custom command
- **TUI toast notifications** — alerts on connection loss/recovery
- **`telegram_status` tool** — AI can check bot status on demand

Each notification includes **context** (recent agent messages).

### Architecture

```
┌──────────────────────────────────────┐
│  opencode (your machine)              │
│  ┌──────────────────────────────────┐ │
│  │ Plugin                           │ │
│  │                                   │ │
│  │  event hook ──POST /event──────┐  │ │    Plugin ──▶ Bot
│  │                                 │  │ │    (outbound HTTPS)
│  │  polling loop ◀──GET /responses│  │ │
│  │     │                          │  │ │
│  │     ▼                          ▼  │ │
│  │  opencode API              Telegram │ │
│  │  (localhost)                Bot    │ │
│  │                             :3456  │ │
│  │  toast() ──▶ TUI                   │ │
│  │  telegram_status tool              │ │
│  └──────────────────────────────────┘ │
└──────────────────────────────────────┘

         ┌─────────────┐
         │ Docker server│◀── Plugin sends events
         │ Telegram Bot │──▶ Plugin picks up responses (poll)
         │  (3456)      │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Telegram App  │
         │ (your phone)  │
         └──────────────┘
```

**Key principle**: The bot **never calls** the opencode API directly. All opencode API calls are made by the plugin locally. The bot is only an event store and response queue.

### Installation

1. **Clone:**

```bash
git clone <repo-url> && cd OCTelegramInt && npm install
```

2. **Create a bot** via [@BotFather](https://t.me/BotFather), get the token

3. **Get your Chat ID** via [@userinfobot](https://t.me/userinfobot)

4. **Generate a secret:**

```bash
openssl rand -hex 32
```

5. **Configure `.env`:**

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
ALLOWED_CHAT_ID=123456789
BRIDGE_SECRET=your_generated_secret
```

### Running the Bot

**Docker (recommended):**

```bash
docker compose up -d --build
docker compose logs -f
```

**Locally:**

```bash
npm run bot
```

### Registering the Plugin

Add to `opencode.jsonc` (project or global `~/.opencode/opencode.jsonc`):

**Remote bot:**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {
      "botUrl": "https://your-server.com/telegram-bridge",
      "secret": "your_generated_secret"
    }]
  ]
}
```

**Local bot (same host):**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

### Graceful Degradation

| Situation | Behavior |
|---|---|
| Bot available | Telegram + TUI work in parallel |
| Bot down | TUI works normally; toast "❌ Bot unavailable" |
| Bot recovered | Toast "⚠️ Reconnected"; pending responses delivered |
| Answered in both TUI and Telegram | First wins; second gets error (ignored) |
| Check status | Type in opencode: "check telegram bot status" → AI calls `telegram_status` |

### Security

- Plugin ↔ Bot: **Bearer token** (timing-safe comparison)
- Bot port: **127.0.0.1 only** (docker-compose)
- Chat ID filter on all Telegram messages
- All secrets in `.env` (in `.gitignore`)
- Pending TTL: 5 minutes, toast debounce: 30 sec
- Payload limit: 1 MB

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Token from @BotFather |
| `ALLOWED_CHAT_ID` | Yes | — | User's Chat ID |
| `BOT_PORT` | No | `3456` | HTTP server port |
| `BOT_HOST` | No | `0.0.0.0` | Host (use `0.0.0.0` in Docker) |
| `CONTEXT_MESSAGE_COUNT` | No | `3` | Messages for context |
| `BRIDGE_SECRET` | Recommended | — | Bearer auth plugin↔bot |

### Project Structure

```
OCTelegramInt/
├── config.ts                  # Configuration
├── shared/types.ts            # Shared types (PluginEvent, BotResponse)
├── plugin/index.ts            # OpenCode server plugin
│                              #   - event hook (sends events to bot)
│                              #   - polling loop (picks up responses)
│                              #   - TUI toasts (status alerts)
│                              #   - telegram_status tool
├── bot/
│   ├── index.ts               # Main entry
│   ├── server.ts              # HTTP: POST /event, GET /responses, DELETE /responses/:id
│   ├── telegram.ts            # grammy bot + text router
│   ├── state.ts               # Pending requests + response queue
│   ├── formatters.ts          # Telegram HTML formatting
│   ├── opencode-client.ts     # Server URL registration (logging only)
│   └── handlers/
│       ├── permission.ts      # Permission → Telegram + queue response
│       ├── question.ts        # Question → Telegram + queue response
│       └── session.ts         # Session → Telegram + queue response
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── package.json
└── tsconfig.json
```

## License

MIT
