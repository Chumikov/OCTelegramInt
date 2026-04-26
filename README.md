# OpenCode Telegram Bridge

Получайте запросы от [OpenCode](https://opencode.ai) прямо в Telegram и отвечайте на них с телефона — разрешения на выполнение команд, вопросы с вариантами ответов, уведомления об ошибках.

```
OpenCode хочет выполнить команду → Telegram → вы нажали «Разрешить» → OpenCode продолжил работу
```

## Как это работает

Проект состоит из двух частей:

1. **Telegram бот** — запускается на сервере (Docker), получает события и отправляет их вам в Telegram. Когда вы нажимаете кнопку, бот сохраняет ответ в очередь.
2. **Plugin** — запускается внутри OpenCode на вашей машине, отправляет события боту и периодически забирает ваши ответы.

Бот **никогда не обращается** к OpenCode напрямую — все вызовы делает plugin локально.

```
Ваша машина                           Сервер
┌──────────────┐    HTTPS POST       ┌──────────────┐    ┌─────────────┐
│  OpenCode     │ ──── события ────▶ │  Telegram Bot │ ──▶│ Telegram App│
│  + Plugin     │ ◀─── ответы ────── │  (Docker)     │ ◀──│ (телефон)    │
└──────────────┘    polling GET      └──────────────┘    └─────────────┘
```

## Требования

- **Telegram бот**: сервер с [Docker](https://docs.docker.com/get-docker/) и [docker compose](https://docs.docker.com/compose/install/) (или Node.js 22+ для запуска без Docker)
- **OpenCode plugin**: [OpenCode](https://opencode.ai) установлен и настроен (поставляется вместе с ним)
- **Telegram аккаунт** для создания бота

## Установка

### Шаг 1. Создайте Telegram бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Придумайте имя (например: `My OpenCode Bridge`) и username (например: `my_oc_bridge_bot`)
4. BotFather пришлёт **токен** вида `123456789:ABCdefGHIjklMNOpqrsTUVwxyz` — сохраните его

### Шаг 2. Узнайте свой Chat ID

1. Откройте [@userinfobot](https://t.me/userinfobot) в Telegram
2. Отправьте `/start`
3. Бот пришлёт ваш **Chat ID** (число, например `123456789`) — сохраните его

### Шаг 3. Сгенерируйте секрет

Этот секрет защищает канал между plugin и ботом от посторонних:

```bash
openssl rand -hex 32
```

Сохраните полученную строку — она понадобится и для `.env`, и для конфига plugin.

### Шаг 4. Запустите бота на сервере

**Клонируйте репозиторий:**

```bash
git clone https://github.com/Chumikov/OCTelegramInt.git
cd OCTelegramInt
```

**Создайте `.env` файл:**

```bash
cp .env.example .env
```

Отредактируйте `.env`, подставив свои значения:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
ALLOWED_CHAT_ID=123456789
BRIDGE_SECRET=ваша_строка_из_openssl_rand
```

> `BOT_PORT` и `BOT_HOST` можно не менять — значения по умолчанию подходят для Docker.

**Запустите через Docker:**

```bash
docker compose up -d --build
```

Проверьте, что бот запустился:

```bash
docker compose logs -f
# Должно быть: [server] Listening on 0.0.0.0:3456
```

**Альтернатива — запуск без Docker** (нужен Node.js 22+):

```bash
npm install
npm run bot
```

### Шаг 5. Опубликуйте бота в интернет (для удалённого сервера)

Бот слушает `127.0.0.1:3456` — он доступен только с localhost. Чтобы plugin на вашей машине мог достучаться до бота, нужен reverse proxy.

**Вариант A: nginx**

```nginx
server {
    listen 443 ssl;
    server_name your-server.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /telegram-bridge/ {
        proxy_pass http://127.0.0.1:3456/;
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }
}
```

Бот будет доступен по адресу: `https://your-server.com/telegram-bridge`

**Вариант B: Caddy** (автоматический HTTPS)

```
your-server.com {
    handle_path /telegram-bridge/* {
        reverse_proxy localhost:3456
    }
}
```

> Если бот и OpenCode на **одной машине** — reverse proxy не нужен. Plugin подключится к `http://localhost:3456`.

### Шаг 6. Подключите plugin к OpenCode

Создайте или отредактируйте файл `~/.opencode/opencode.jsonc` (глобально для всех проектов) или `opencode.jsonc` в папке проекта:

**Если бот на сервере (через internet):**

```jsonc
{
  "plugin": [
    ["~/OCTelegramInt/plugin/index.ts", {
      "botUrl": "https://your-server.com/telegram-bridge",
      "secret": "ваша_строка_из_openssl_rand"
    }]
  ]
}
```

**Если бот на той же машине:**

```jsonc
{
  "plugin": [
    ["~/OCTelegramInt/plugin/index.ts", {}]
  ]
}
```

> Путь к plugin указывайте **относительно `opencode.jsonc`** или используйте `~` для домашней директории. Замените `~/OCTelegramInt` на реальный путь, куда вы клонировали репозиторий.

### Шаг 7. Проверьте, что всё работает

1. Запустите OpenCode в терминале
2. В Telegram отправьте боту `/start` — он должен ответить: «Бот запущен и ожидает события от OpenCode»
3. Начните работу в OpenCode — при запросе разрешения вы получите уведомление в Telegram
4. Для проверки статуса бота скажите OpenCode: «проверь статус телеграм бота» — AI вызовет инструмент `telegram_status`

## Что бот пересылает

| Событие в OpenCode | Что вы видите в Telegram | Кнопки |
|---|---|---|
| Агент просит разрешение (чтение/запись/выполнение) | Сообщение с описанием и контекстом | «Разрешить» / «Всегда» / «Отклонить» |
| Агент задаёт вопрос с вариантами | Сообщение с вариантами | Inline-кнопки + «Свой ответ» |
| Сессия остановилась (idle/error) | Уведомление с последним контекстом | «Продолжить» / отправить команду текстом |

Каждое уведомление включает **контекст** — последние сообщения агента, чтобы вы понимали, почему появился запрос.

## Если бот недоступен

OpenCode продолжит работать нормально — все запросы можно ответить в терминале (TUI). Telegram — дополнительный канал, не замена.

- Бот недоступен → в TUI появится уведомление: «Бот недоступен»
- Бот восстановился → уведомление «Подключение восстановлено»
- Ответили и в TUI, и в Telegram → первый ответ выигрывает, второй игнорируется

## Переменные окружения

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Да | — | Токен от @BotFather |
| `ALLOWED_CHAT_ID` | Да | — | Ваш Chat ID (фильтр — бот отвечает только вам) |
| `BRIDGE_SECRET` | Да | — | Секрет для защиты канала plugin↔бот (из `openssl rand -hex 32`) |
| `BOT_PORT` | Нет | `3456` | Порт HTTP-сервера |
| `BOT_HOST` | Нет | `0.0.0.0` | Хост для прослушивания (в Docker всегда `0.0.0.0`) |
| `CONTEXT_MESSAGE_COUNT` | Нет | `3` | Сколько последних сообщений агента добавлять в контекст |

## Безопасность

- Канал plugin↔бот защищён **Bearer token** (timing-safe сравнение)
- Порт бота доступен только с **localhost** (`127.0.0.1` в docker-compose)
- Бот обрабатывает сообщения **только от ALLOWED_CHAT_ID**
- Все секреты в `.env` (исключён из git через `.gitignore`)
- Старые запросы удаляются автоматически через **5 минут**

## Структура проекта

```
OCTelegramInt/
├── plugin/index.ts            # OpenCode plugin (events + polling + toasts)
├── bot/
│   ├── index.ts               # Точка входа
│   ├── server.ts              # HTTP API (POST /event, GET /responses)
│   ├── telegram.ts            # grammy бот
│   ├── state.ts               # Очередь ответов
│   ├── formatters.ts          # Форматирование сообщений
│   └── handlers/
│       ├── permission.ts      # Запросы разрешений
│       ├── question.ts        # Вопросы с вариантами
│       └── session.ts         # Остановки сессий
├── shared/types.ts            # Общие типы
├── config.ts                  # Конфигурация
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

MIT
