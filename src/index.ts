import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore
import RustPlus from '@liamcottle/rustplus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Токен вашего бота rustikcsBot
const BOT_TOKEN = '8994053679:AAGkB_Jy3dgIJvbBG3kdoKAzDxlXftdblk4';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Вспомогательная функция для подключения к Rust+ серверу
const executeOnRustPlus = async (credentials: { ip: string, port: number, playerId: string, playerToken: number }, callback: (rustplus: any) => Promise<any>) => {
  return new Promise((resolve, reject) => {
    const rustplus = new RustPlus(credentials.ip, credentials.port, credentials.playerId, credentials.playerToken);
    
    rustplus.on('error', (err: any) => {
      reject(err);
    });

    rustplus.connect(async () => {
      try {
        const result = await callback(rustplus);
        rustplus.disconnect();
        resolve(result);
      } catch (e) {
        rustplus.disconnect();
        reject(e);
      }
    });
  });
};

// 1. Информация о сервере и онлайн
app.post('/api/info', async (req, res) => {
  try {
    const { ip, port, playerId, playerToken } = req.body;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => rp.getInfo((message: any) => res(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 2. Время в игре
app.post('/api/time', async (req, res) => {
  try {
    const { ip, port, playerId, playerToken } = req.body;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => rp.getTime((message: any) => res(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 3. Управление умным устройством (Включить / Выключить Smart Switch)
app.post('/api/device', async (req, res) => {
  try {
    const { ip, port, playerId, playerToken, entityId, turnOn } = req.body;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => {
        if (turnOn) {
          rp.turnSmartSwitchOn(entityId, (message: any) => res(message));
        } else {
          rp.turnSmartSwitchOff(entityId, (message: any) => res(message));
        }
      });
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 4. Отправить сообщение в клановый/командный чат
app.post('/api/chat', async (req, res) => {
  try {
    const { ip, port, playerId, playerToken, messageText } = req.body;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => rp.sendTeamMessage(messageText, (message: any) => res(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Telegram команда старта для rustikcsBot
bot.command('start', (ctx) => {
  const webAppUrl = process.env.WEB_APP_URL || `https://${process.env.RAILWAY_STATIC_URL}`;
  ctx.reply(
    '🎮 Привет! Это бот **rustikcsBot** для управления Rust+.\n\nНажмите кнопку ниже, чтобы открыть панель:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть Rust+ App', webAppUrl)]])
    }
  );
});

bot.launch().then(() => {
  console.log('🤖 Бот rustikcsBot успешно запущен!');
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🌐 Сервер запущен на порту ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
