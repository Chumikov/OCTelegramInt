# OpenCode Telegram Bridge

Integrate [OpenCode](https://opencode.ai) with Telegram to receive and respond to interactive prompts remotely.

---

## 🇷🇺 Описание (Русский)

**OpenCode Telegram Bridge** — это гибридная интеграция (server plugin + standalone бот), которая пересылает интерактивные запросы OpenCode в Telegram:

- **Запросы разрешений** (чтение, запись, выполнение команд) — с кнопками «Разрешить / Всегда / Отклонить»
- **Вопросы с вариантами ответов** (инструмент `question`) — с inline-кнопками и возможностью ввести свой ответ
- **Остановки сессии** (idle, error) — с кнопкой «Продолжить» или отправкой произвольной команды

Каждое уведомление включает **контекст** (последние сообщения агента), чтобы понимать причину запроса.

### Архитектура

```
┌─────────────────────────────┐
│  opencode (процесс)          │
│  ┌────────────────────────┐  │
│  │ Plugin (server plugin) │──┼── HTTP POST ──┐
│  │ хук event              │  │               │
│  └────────────────────────┘  │               ▼
└─────────────────────────────┘    ┌──────────────────┐
                                   │  Telegram Bot     │
                                   │  (localhost:3456) │
                                   │  grammy + Node.js │
                                   └──────────────────┘
                                           │
                                           ▼
                                   ┌──────────────┐
                                   │  Telegram App │
                                   │  (ваш телефон) │
                                   └──────────────┘
```

### Установка

1. **Клонируйте и установите зависимости:**

```bash
git clone <repo-url>
cd OCTelegramInt
npm install
```

2. **Создайте Telegram бота:**

- Откройте [@BotFather](https://t.me/BotFather) в Telegram
- Создайте нового бота: `/newbot`
- Скопируйте полученный токен

3. **Узнайте свой Chat ID:**

- Напишите [@userinfobot](https://t.me/userinfobot)
- Скопируйте ваш Chat ID (число)

4. **Настройте `.env`:**

```bash
cp .env.example .env
```

Отредактируйте `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ALLOWED_CHAT_ID=123456789
BOT_PORT=3456
OPENCODE_SERVER_URL=http://localhost:4096
CONTEXT_MESSAGE_COUNT=3
```

5. **Подключите plugin к OpenCode:**

Добавьте в `opencode.jsonc` вашего проекта (или глобально `~/.opencode/opencode.jsonc`):

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

Или укажите абсолютный путь к плагину.

### Запуск

```bash
# Запуск Telegram бота
npm run bot

# Или в режиме разработки (auto-reload)
npm run bot:dev
```

Затем запустите OpenCode как обычно — plugin автоматически подключится к боту.

### Безопасность

- Бот обрабатывает сообщения **только от ALLOWED_CHAT_ID**
- Event server слушает **только на 127.0.0.1** (недоступен извне)
- Все секреты хранятся в `.env` (исключён из git)
- Поддержка `OPENCODE_SERVER_PASSWORD` для Basic Auth к opencode API
- Pending-запросы автоматически удаляются через 5 минут (TTL)

### Переменные окружения

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Да | — | Токен Telegram бота от @BotFather |
| `ALLOWED_CHAT_ID` | Да | — | Chat ID пользователя (фильтр) |
| `BOT_PORT` | Нет | `3456` | Порт HTTP-сервера для приёма событий от plugin |
| `OPENCODE_SERVER_URL` | Нет | `http://localhost:4096` | URL сервера OpenCode |
| `OPENCODE_SERVER_PASSWORD` | Нет | — | Пароль для Basic Auth к OpenCode API |
| `CONTEXT_MESSAGE_COUNT` | Нет | `3` | Количество последних сообщений для контекста |

---

## 🇬🇧 Description (English)

**OpenCode Telegram Bridge** is a hybrid integration (server plugin + standalone bot) that forwards OpenCode's interactive prompts to Telegram:

- **Permission requests** (read, write, execute) — with "Allow / Always / Deny" buttons
- **Questions with options** (`question` tool) — with inline buttons and custom text input
- **Session stops** (idle, error) — with "Continue" button or custom command submission

Each notification includes **context** (recent agent messages) to understand why the prompt appeared.

### Architecture

```
┌─────────────────────────────┐
│  opencode (process)          │
│  ┌────────────────────────┐  │
│  │ Plugin (server plugin) │──┼── HTTP POST ──┐
│  │ event hook             │  │               │
│  └────────────────────────┘  │               ▼
└─────────────────────────────┘    ┌──────────────────┐
                                   │  Telegram Bot     │
                                   │  (localhost:3456) │
                                   │  grammy + Node.js │
                                   └──────────────────┘
                                           │
                                           ▼
                                   ┌──────────────┐
                                   │  Telegram App │
                                   │  (your phone)  │
                                   └──────────────┘
```

### Installation

1. **Clone and install dependencies:**

```bash
git clone <repo-url>
cd OCTelegramInt
npm install
```

2. **Create a Telegram bot:**

- Open [@BotFather](https://t.me/BotFather) in Telegram
- Create a new bot: `/newbot`
- Copy the bot token

3. **Get your Chat ID:**

- Message [@userinfobot](https://t.me/userinfobot)
- Copy your Chat ID (number)

4. **Configure `.env`:**

```bash
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ALLOWED_CHAT_ID=123456789
BOT_PORT=3456
OPENCODE_SERVER_URL=http://localhost:4096
CONTEXT_MESSAGE_COUNT=3
```

5. **Register the plugin with OpenCode:**

Add to your project's `opencode.jsonc` (or globally `~/.opencode/opencode.jsonc`):

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

Or use the absolute path to the plugin.

### Running

```bash
# Start the Telegram bot
npm run bot

# Or in development mode (auto-reload)
npm run bot:dev
```

Then start OpenCode as usual — the plugin will automatically connect to the bot.

### Security

- Bot only processes messages from **ALLOWED_CHAT_ID**
- Event server listens on **127.0.0.1 only** (not externally accessible)
- All secrets stored in `.env` (excluded from git)
- Supports `OPENCODE_SERVER_PASSWORD` for Basic Auth to OpenCode API
- Pending requests are automatically cleaned up after 5 minutes (TTL)

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather |
| `ALLOWED_CHAT_ID` | Yes | — | User's Chat ID (filter) |
| `BOT_PORT` | No | `3456` | HTTP server port for receiving events from plugin |
| `OPENCODE_SERVER_URL` | No | `http://localhost:4096` | OpenCode server URL |
| `OPENCODE_SERVER_PASSWORD` | No | — | Password for Basic Auth to OpenCode API |
| `CONTEXT_MESSAGE_COUNT` | No | `3` | Number of recent messages for context |

### Project Structure

```
OCTelegramInt/
├── config.ts                 # Configuration (env vars, validation)
├── shared/
│   └── types.ts              # Shared TypeScript types
├── plugin/
│   └── index.ts              # OpenCode server plugin (event hook)
├── bot/
│   ├── index.ts              # Main entry point
│   ├── server.ts             # HTTP server (receives events from plugin)
│   ├── telegram.ts           # grammy bot setup + centralized router
│   ├── state.ts              # Pending request management (TTL)
│   ├── formatters.ts         # Telegram message formatting (HTML)
│   ├── opencode-client.ts    # HTTP client for OpenCode API
│   └── handlers/
│       ├── permission.ts     # Permission request handler
│       ├── question.ts       # Question request handler
│       └── session.ts        # Session idle/error handler
├── .env.example
├── package.json
└── tsconfig.json
```

## License

MIT
