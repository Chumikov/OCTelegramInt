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
│  opencode (local machine)    │
│  ┌────────────────────────┐  │
│  │ Plugin (server plugin) │──┼── HTTPS POST ──────────┐
│  │ хук event              │  │  (Bearer auth)         │
│  └────────────────────────┘  │                         ▼
└─────────────────────────────┘     ┌──────────────────────┐
                                    │  Telegram Bot         │
                                    │  (Docker on server)   │
                                    │  :3456                │
                                    └──────────────────────┘
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

4. **Сгенерируйте секрет для plugin ↔ bot канала:**

```bash
openssl rand -hex 32
```

5. **Настройте `.env`:**

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
BRIDGE_SECRET=ваш_сгенерированный_секрет
```

### Запуск через Docker (рекомендуется для сервера)

```bash
# Собрать и запустить
docker compose up -d --build

# Логи
docker compose logs -f

# Остановить
docker compose down
```

Бот будет слушать порт `3456` на сервере (только localhost — благодаря `127.0.0.1` в docker-compose.yml).

Для доступа plugin через интернет настройте reverse proxy (nginx/caddy):

```nginx
# Пример nginx
location /telegram-bridge/ {
    proxy_pass http://127.0.0.1:3456/;
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
}
```

### Запуск локально (без Docker)

```bash
npm run bot        # Продакшен
npm run bot:dev    # Разработка (auto-reload)
```

### Подключение plugin к OpenCode

Добавьте в `opencode.jsonc` вашего проекта (или глобально `~/.opencode/opencode.jsonc`):

**Локально (бот на этом же компьютере):**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

**Удалённо (бот на сервере):**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {
      "botUrl": "https://your-server.com/telegram-bridge/event",
      "secret": "ваш_сгенерированный_секрет"
    }]
  ]
}
```

### Безопасность

- Бот обрабатывает сообщения **только от ALLOWED_CHAT_ID**
- Plugin ↔ Bot канал защищён **Bearer token** (timing-safe comparison)
- Event server слушает **только на 127.0.0.1** (недоступен извне напрямую)
- Docker публикует порт **только на localhost** (`127.0.0.1:3456:3456`)
- Все секреты хранятся в `.env` (исключён из git)
- Поддержка `OPENCODE_SERVER_PASSWORD` для Basic Auth к opencode API
- Pending-запросы автоматически удаляются через 5 минут (TTL)
- Payload limit: 1 MB

### Переменные окружения

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Да | — | Токен Telegram бота от @BotFather |
| `ALLOWED_CHAT_ID` | Да | — | Chat ID пользователя (фильтр) |
| `BOT_PORT` | Нет | `3456` | Порт HTTP-сервера |
| `BOT_HOST` | Нет | `0.0.0.0` | Хост для прослушивания (в Docker — 0.0.0.0) |
| `OPENCODE_SERVER_URL` | Нет | `http://localhost:4096` | URL сервера OpenCode |
| `OPENCODE_SERVER_PASSWORD` | Нет | — | Пароль для Basic Auth к OpenCode API |
| `CONTEXT_MESSAGE_COUNT` | Нет | `3` | Количество последних сообщений для контекста |
| `BRIDGE_SECRET` | Рекомендуется | — | Секрет для Bearer auth plugin→bot |

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
│  opencode (local machine)    │
│  ┌────────────────────────┐  │
│  │ Plugin (server plugin) │──┼── HTTPS POST ──────────┐
│  │ event hook             │  │  (Bearer auth)         │
│  └────────────────────────┘  │                         ▼
└─────────────────────────────┘     ┌──────────────────────┐
                                    │  Telegram Bot         │
                                    │  (Docker on server)   │
                                    │  :3456                │
                                    └──────────────────────┘
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

4. **Generate a secret for plugin ↔ bot channel:**

```bash
openssl rand -hex 32
```

5. **Configure `.env`:**

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
BRIDGE_SECRET=your_generated_secret
```

### Running with Docker (recommended for server)

```bash
# Build and start
docker compose up -d --build

# Logs
docker compose logs -f

# Stop
docker compose down
```

The bot listens on port `3456` on the server (localhost only — via `127.0.0.1` in docker-compose.yml).

For plugin access over the internet, set up a reverse proxy (nginx/caddy):

```nginx
# nginx example
location /telegram-bridge/ {
    proxy_pass http://127.0.0.1:3456/;
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
}
```

### Running locally (without Docker)

```bash
npm run bot        # Production
npm run bot:dev    # Development (auto-reload)
```

### Registering the plugin with OpenCode

Add to your project's `opencode.jsonc` (or globally `~/.opencode/opencode.jsonc`):

**Local (bot on the same machine):**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

**Remote (bot on a server):**

```jsonc
{
  "plugin": [
    ["./path/to/OCTelegramInt/plugin/index.ts", {
      "botUrl": "https://your-server.com/telegram-bridge/event",
      "secret": "your_generated_secret"
    }]
  ]
}
```

### Security

- Bot only processes messages from **ALLOWED_CHAT_ID**
- Plugin ↔ Bot channel protected with **Bearer token** (timing-safe comparison)
- Event server listens on **127.0.0.1 only** (not directly externally accessible)
- Docker publishes port **on localhost only** (`127.0.0.1:3456:3456`)
- All secrets stored in `.env` (excluded from git)
- Supports `OPENCODE_SERVER_PASSWORD` for Basic Auth to OpenCode API
- Pending requests are automatically cleaned up after 5 minutes (TTL)
- Payload limit: 1 MB

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram bot token from @BotFather |
| `ALLOWED_CHAT_ID` | Yes | — | User's Chat ID (filter) |
| `BOT_PORT` | No | `3456` | HTTP server port |
| `BOT_HOST` | No | `0.0.0.0` | Host to listen on (use `0.0.0.0` in Docker) |
| `OPENCODE_SERVER_URL` | No | `http://localhost:4096` | OpenCode server URL |
| `OPENCODE_SERVER_PASSWORD` | No | — | Password for Basic Auth to OpenCode API |
| `CONTEXT_MESSAGE_COUNT` | No | `3` | Number of recent messages for context |
| `BRIDGE_SECRET` | Recommended | — | Secret for Bearer auth plugin→bot |

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
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── package.json
└── tsconfig.json
```

## License

MIT
