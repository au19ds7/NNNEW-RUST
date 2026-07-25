import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import path from 'path';
import session from 'express-session';
import passport from 'passport';
import SteamStrategy from 'passport-steam';
// @ts-ignore
import RustPlus from '@liamcottle/rustplus.js';

// Токен вашего бота rustikcsBot
const BOT_TOKEN = '8994053679:AAGkB_Jy3dgIJvbBG3kdoKAzDxlXftdblk4';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// Определение базового URL для OpenID и Mini App
const getBaseUrl = (req?: any) => {
  let rawUrl = process.env.WEB_APP_URL || process.env.RAILWAY_STATIC_URL;
  if (!rawUrl && req) {
    rawUrl = `${req.protocol}://${req.get('host')}`;
  }
  if (!rawUrl) rawUrl = 'http://localhost:3000';
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = `https://${rawUrl}`;
  }
  return rawUrl.replace(/\/$/, '');
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'rustplus_super_secret_key', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj: any, done) => done(null, obj));

// Настройка Steam OpenID Strategy
passport.use(new SteamStrategy({
    returnURL: '', // Динамически переопределим ниже или в запросе
    realm: '',
    apiKey: '' // Steam API Key не обязателен для базового OpenID, но можно указать если есть
  },
  (identifier: string, profile: any, done: any) => {
    profile.identifier = identifier;
    return done(null, profile);
  }
));

// Динамическая настройка редиректа Steam OpenID под текущий домен Railway
app.use((req, res, next) => {
  const baseUrl = getBaseUrl(req);
  (passport._strategies['steam'] as any)._returnURL = `${baseUrl}/auth/steam/return`;
  (passport._strategies['steam'] as any)._realm = `${baseUrl}/`;
  next();
});

// Раздача статики
app.use(express.static(path.join(process.cwd(), 'src', 'public')));

// --- Эндпоинты авторизации через Steam ---
app.get('/auth/steam', passport.authenticate('steam', { failureRedirect: '/' }));

app.get('/auth/steam/return',
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    // Успешный вход через Steam, перенаправляем обратно в Mini App
    res.redirect('/');
  }
);

// Проверка статуса авторизации текущего пользователя
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// --- API для работы с Rust+ ---
const executeOnRustPlus = async (credentials: { ip: string, port: number, playerId: string, playerToken: number }, callback: (rustplus: any) => Promise<any>) => {
  return new Promise((resolve, reject) => {
    const rustplus = new RustPlus(credentials.ip, credentials.port, credentials.playerId, credentials.playerToken);
    
    rustplus.on('error', (err: any) => reject(err));

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

app.post('/api/info', async (req, res) => {
  try {
    const { ip, port, playerToken } = req.body;
    const user: any = req.user;
    
    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: 'Требуется авторизация через Steam!' });
    }

    const playerId = user.id; // SteamID берется автоматически из сессии Steam OpenID!

    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => rp.getInfo((message: any) => res(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/time', async (req, res) => {
  try {
    const { ip, port, playerToken } = req.body;
    const user: any = req.user;
    if (!user || !user.id) return res.status(401).json({ success: false, error: 'Требуется авторизация через Steam!' });

    const playerId = user.id;

    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => rp.getTime((message: any) => res(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/device', async (req, res) => {
  try {
    const { ip, port, playerToken, entityId, turnOn } = req.body;
    const user: any = req.user;
    if (!user || !user.id) return res.status(401).json({ success: false, error: 'Требуется авторизация через Steam!' });

    const playerId = user.id;

    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp) => {
      return new Promise((res) => {
        if (turnOn) rp.turnSmartSwitchOn(entityId, (message: any) => res(message));
        else rp.turnSmartSwitchOff(entityId, (message: any) => res(message));
      });
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Telegram команда старта
bot.command('start', (ctx) => {
  let webAppUrl = getBaseUrl();
  ctx.reply(
    '🎮 Привет! Это бот **rustikcsBot**.\n\nНажмите кнопку ниже для входа через Steam и управления Rust+:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть Панель Rust+', webAppUrl)]])
    }
  );
});

bot.launch().then(() => console.log('🤖 Бот успешно запущен!'));
app.listen(Number(PORT), '0.0.0.0', () => console.log(`🌐 Сервер запущен на порту ${PORT}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
