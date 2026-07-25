import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import path from 'path';
import session from 'express-session';
import passport from 'passport';
// @ts-ignore
import SteamStrategy from 'passport-steam';
// @ts-ignore
import RustPlus from '@liamcottle/rustplus.js';

const BOT_TOKEN = '8994053679:AAGkB_Jy3dgIJvbBG3kdoKAzDxlXftdblk4';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

const getCleanDomain = () => {
  let domain = process.env.WEB_APP_URL || process.env.RAILWAY_STATIC_URL || 'localhost:3000';
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return domain;
};

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

passport.serializeUser((user: any, done: (err: any, id?: any) => void) => done(null, user));
passport.deserializeUser((obj: any, done: (err: any, user?: any) => void) => done(null, obj));

const domain = getCleanDomain();

passport.use(new SteamStrategy({
    returnURL: `https://${domain}/auth/steam/return`,
    realm: `https://${domain}/`,
    apiKey: '2C4C7842FA8C4EAA3E5004D73649A90A'
  },
  (identifier: string, profile: any, done: (err: any, user?: any) => void) => {
    profile.identifier = identifier;
    return done(null, profile);
  }
));

app.use(express.static(path.join(process.cwd(), 'src', 'public')));

app.get('/auth/steam', passport.authenticate('steam', { failureRedirect: '/' }));

app.get('/auth/steam/return',
  (req: any, res: any, next: any) => {
    passport.authenticate('steam', { failureRedirect: '/' }, (err: any, user: any) => {
      if (err) {
        console.error('STEAM AUTH ERROR:', err);
        return res.status(500).send('Auth error: ' + err.message);
      }
      if (!user) {
        return res.redirect('/');
      }
      req.logIn(user, (loginErr: any) => {
        if (loginErr) {
          console.error('LOGIN SESSION ERROR:', loginErr);
          return res.status(500).send('Login error: ' + loginErr.message);
        }
        return res.redirect('/');
      });
    })(req, res, next);
  }
);

app.get('/api/user', (req: any, res: any) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/auth/logout', (req: any, res: any) => {
  if (typeof req.logout === 'function') {
    req.logout(() => {
      res.redirect('/');
    });
  } else {
    res.redirect('/');
  }
});

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

app.post('/api/info', async (req: any, res: any) => {
  try {
    const { ip, port, playerToken } = req.body;
    const user = req.user;
    
    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: 'Требуется авторизация через Steam!' });
    }

    const playerId = user.id;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp: any) => {
      return new Promise((resolve) => rp.getInfo((message: any) => resolve(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/time', async (req: any, res: any) => {
  try {
    const { ip, port, playerToken } = req.body;
    const user = req.user;
    if (!user || !user.id) return res.status(401).json({ success: false, error: 'Требуется авторизация через Steam!' });

    const playerId = user.id;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp: any) => {
      return new Promise((resolve) => rp.getTime((message: any) => resolve(message)));
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/device', async (req: any, res: any) => {
  try {
    const { ip, port, playerToken, entityId, turnOn } = req.body;
    const user = req.user;
    if (!user || !user.id) return res.status(401).json({ success: false, error: 'Требуется авторизация через Steam!' });

    const playerId = user.id;
    const data = await executeOnRustPlus({ ip, port: Number(port), playerId, playerToken: Number(playerToken) }, async (rp: any) => {
      return new Promise((resolve) => {
        if (turnOn) rp.turnSmartSwitchOn(entityId, (message: any) => resolve(message));
        else rp.turnSmartSwitchOff(entityId, (message: any) => resolve(message));
      });
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

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
