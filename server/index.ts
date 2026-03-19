import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import './config.js'; // Validate environment first
import { getDatabase, initDatabase } from './db.js';
import {
  login,
  authenticateToken,
  AuthRequest,
  verifyPin,
  isMagicLinkEnabled,
  sendMagicLink,
  confirmMagicLink,
  findOrCreateAppUserFromSupabase,
  createAppSession,
  setAppSessionCookie,
  clearAuthCookies,
  revokeAppSession,
} from './auth.js';
import expensesRouter from './routes/expenses.js';
import budgetsRouter from './routes/budgets.js';
import goalsRouter from './routes/goals.js';
import { port, appSessionCookieName } from './config.js';
import { pinSchema } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const magicLinkSchema = z.object({
  email: z.string().email(),
});
const sessionExchangeSchema = z.object({
  accessToken: z.string().min(1),
});
const magicLinkConfirmSchema = z.object({
  tokenHash: z.string().min(1),
  type: z.string().min(1),
});

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cookieParser());

// Rate limiting for the login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const csrfCheck = (req: any, res: any, next: any) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  if (req.headers['x-nido-request'] === 'true') {
    return next();
  }
  return res.status(403).json({ error: 'Seguridad CSRF: Petición no autorizada' });
};

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nido-request'],
  credentials: true
}));
app.use(express.json());
app.use(csrfCheck);

app.get('/api/auth/config', (_req, res) => {
  res.json({
    magicLinkEnabled: isMagicLinkEnabled(),
  });
});

app.post('/api/auth/magic-link/start', loginLimiter, async (req, res) => {
  const validation = magicLinkSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  if (!isMagicLinkEnabled()) {
    return res.status(404).json({ error: 'Magic link auth is not configured' });
  }

  const result = await sendMagicLink(validation.data.email.trim().toLowerCase());

  if (!result.success) {
    if (result.reason === 'forbidden') {
      return res.status(403).json({ error: 'Magic link no permitido para este email' });
    }

    if (result.reason === 'disabled') {
      return res.status(404).json({ error: 'Magic link auth is not configured' });
    }

    if (result.reason === 'rate_limited') {
      return res.status(429).json({ error: result.error });
    }

    if (result.reason === 'auth') {
      return res.status(result.status).json({ error: result.error });
    }

    if ('status' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(502).json({ error: 'No se pudo enviar el magic link' });
  }

  res.json({ success: true, message: 'Si el email existe, recibirás un magic link enseguida.' });
});

app.post('/api/auth/session/exchange', loginLimiter, async (req, res) => {
  const validation = sessionExchangeSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Access token inválido' });
  }

  if (!isMagicLinkEnabled()) {
    return res.status(404).json({ error: 'Magic link auth is not configured' });
  }

  const result = await findOrCreateAppUserFromSupabase(validation.data.accessToken);
  if (!result.success) {
    if (result.reason === 'forbidden') {
      return res.status(403).json({ error: 'Supabase session is not allowed' });
    }

    if (result.reason === 'disabled') {
      return res.status(404).json({ error: 'Magic link auth is not configured' });
    }

    if (result.reason === 'auth') {
      return res.status(result.status).json({ error: result.error });
    }

    if ('status' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(502).json({ error: 'Supabase session exchange failed' });
  }

  const { sessionToken } = await createAppSession(result.user.id, req);
  setAppSessionCookie(res, sessionToken);

  res.json({ user: result.user });
});

app.post('/api/auth/magic-link/confirm', loginLimiter, async (req, res) => {
  const validation = magicLinkConfirmSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Parámetros de confirmación inválidos' });
  }

  if (!isMagicLinkEnabled()) {
    return res.status(404).json({ error: 'Magic link auth is not configured' });
  }

  const confirmResult = await confirmMagicLink(validation.data.tokenHash, validation.data.type);
  if (!confirmResult.success) {
    if (confirmResult.reason === 'disabled') {
      return res.status(404).json({ error: 'Magic link auth is not configured' });
    }

    return res.status(confirmResult.status).json({ error: confirmResult.error });
  }

  const result = await findOrCreateAppUserFromSupabase(confirmResult.accessToken);
  if (!result.success) {
    if (result.reason === 'forbidden') {
      return res.status(403).json({ error: 'Supabase session is not allowed' });
    }

    if (result.reason === 'disabled') {
      return res.status(404).json({ error: 'Magic link auth is not configured' });
    }

    if ('status' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(502).json({ error: 'Supabase session exchange failed' });
  }

  const { sessionToken } = await createAppSession(result.user.id, req);
  setAppSessionCookie(res, sessionToken);

  res.json({ user: result.user });
});

// Legacy auth endpoint kept as staged fallback.
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await login(username, password);

    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 365 * 24 * 60 * 60 * 1000
    });

    res.json({ user: result.user, token: result.token, authMode: 'legacy' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const respondWithAuthenticatedUser = (req: AuthRequest, res: express.Response) => {
  res.json({ user: req.user });
};

app.get('/api/auth/me', authenticateToken, respondWithAuthenticatedUser);
app.get('/api/auth/session', authenticateToken, respondWithAuthenticatedUser);

app.post('/api/auth/verify-pin', authenticateToken, async (req: AuthRequest, res) => {
  const validation = pinSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'PIN inválido' });
  }

  const { pin } = validation.data;
  const username = req.user!.username;

  try {
    const isValid = await verifyPin(username, pin);
    if (isValid) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'PIN incorrecto' });
    }
  } catch (error) {
    console.error('PIN verify error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/update-pin', authenticateToken, async (req: AuthRequest, res) => {
  const validation = pinSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'PIN inválido',
      details: validation.error.format()
    });
  }

  const { pin } = validation.data;
  const username = req.user!.username;

  try {
    const db = getDatabase();
    await db.run('UPDATE users SET pin = ? WHERE username = ?', pin, username);
    res.json({ success: true, message: 'PIN actualizado correctamente' });
  } catch (error) {
    console.error('PIN update error:', error);
    res.status(500).json({ error: 'Failed to update PIN' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    await revokeAppSession(req.cookies?.[appSessionCookieName]);
  } catch (error) {
    console.error('Session revoke error:', error);
  } finally {
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  }
});

app.use('/api/expenses', authenticateToken, expensesRouter);
app.use('/api/budgets', authenticateToken, budgetsRouter);
app.use('/api/goals', authenticateToken, goalsRouter);

// Categories routes
app.get('/api/categories', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const categories = await db.all('SELECT * FROM categories WHERE household_id = (SELECT household_id FROM app_users WHERE id = ?)', req.user!.id);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', authenticateToken, async (req: AuthRequest, res) => {
  const { name, emoji, color, id } = req.body;
  if (!name || !emoji || !color) return res.status(400).json({ error: 'Name, emoji and color are required' });

  try {
    const db = getDatabase();
    const user = await db.get('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
    
    if (id) {
      await db.run('UPDATE categories SET name = ?, emoji = ?, color = ? WHERE id = ? AND household_id = ?', 
        name, emoji, color, id, user.household_id);
    } else {
      await db.run('INSERT INTO categories (household_id, name, emoji, color) VALUES (?, ?, ?, ?)', 
        user.household_id, name, emoji, color);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save category' });
  }
});

app.delete('/api/categories/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
    await db.run('DELETE FROM categories WHERE id = ? AND household_id = ?', req.params.id, user.household_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Household members
app.get('/api/household/members', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    // In this app, we assume all users in the 'users' table belong to the same household for now
    const members = await db.all('SELECT id, username FROM users');
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const clientBuildPath = path.join(__dirname, '../client');
app.use(express.static(clientBuildPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const startServer = async () => {
  try {
    await initDatabase();

    app.listen(port, () => {
      console.log(`🚀 Nido server running on port ${port}`);
      console.log(`📱 App: http://localhost:${port}`);
      console.log(`🔌 API: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
};

void startServer();
