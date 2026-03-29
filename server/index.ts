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
import { getDatabase, initDatabase, notifyPartner } from './db.js';
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
import analyticsRouter from './routes/analytics.js';
import notificationsRouter from './routes/notifications.js';
import recurringRouter from './routes/recurring.js';
import cyclesRouter from './routes/cycles.js';
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

const csrfCheck = (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
app.use('/api/analytics', authenticateToken, analyticsRouter);
app.use('/api/notifications', authenticateToken, notificationsRouter);
app.use('/api/recurring', authenticateToken, recurringRouter);
app.use('/api/cycles', authenticateToken, cyclesRouter);

// Categories routes
app.get('/api/categories', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const householdId = (await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id))?.household_id;
    const context = (req.query.context as string) === 'personal' ? 'personal' : 'shared';

    const registered = await db.all<Array<{ id: number; name: string; emoji: string; color: string; context: string; owner_user_id?: number | null }>>(
      context === 'personal'
        ? `SELECT * FROM categories
           WHERE household_id = ?
             AND ((context = 'personal' AND owner_user_id = ?) OR (context = 'shared' AND owner_user_id IS NULL))`
        : `SELECT * FROM categories
           WHERE household_id = ? AND context = 'shared' AND owner_user_id IS NULL`,
      ...(context === 'personal' ? [householdId, req.user!.id] : [householdId])
    );

    const budgetCats = await db.all<Array<{ category: string }>>(
      context === 'personal'
        ? `SELECT DISTINCT category FROM category_budgets
           WHERE amount > 0 AND context = 'personal' AND owner_user_id = ?`
        : `SELECT DISTINCT category FROM category_budgets
           WHERE amount > 0 AND context = 'shared' AND owner_user_id IS NULL`,
      ...(context === 'personal' ? [req.user!.id] : [])
    );

    const expenseCats = await db.all<Array<{ category: string }>>(
      context === 'personal'
        ? `SELECT DISTINCT category FROM expenses
           WHERE category IS NOT NULL AND type = 'personal' AND (paid_by_user_id = ? OR (paid_by_user_id IS NULL AND paid_by = ?))`
        : `SELECT DISTINCT category FROM expenses
           WHERE category IS NOT NULL AND type = 'shared'`,
      ...(context === 'personal' ? [req.user!.id, req.user!.username] : [])
    );

    const candidateNames = Array.from(new Set([
      ...registered.map(c => c.name),
      ...budgetCats.map(b => b.category),
      ...expenseCats.map(e => e.category),
    ]));

    const all = candidateNames.map((name) => {
      const personalMatch = registered.find(c => c.name === name && c.context === 'personal' && c.owner_user_id === req.user!.id);
      const sharedMatch = registered.find(c => c.name === name && c.context === 'shared' && (c.owner_user_id == null));
      const match = personalMatch || sharedMatch;
      return match ?? { id: 0, name, emoji: '📂', color: '#6B7280' };
    });

    res.json(all);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', authenticateToken, async (req: AuthRequest, res) => {
  const { name, emoji, color, id, context } = req.body;
  if (!name || !emoji || !color) return res.status(400).json({ error: 'Name, emoji and color are required' });

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const nextContext = context === 'personal' ? 'personal' : 'shared';
    const ownerUserId = nextContext === 'personal' ? req.user!.id : null;
    
    if (id) {
      await db.run(
        `UPDATE categories SET name = ?, emoji = ?, color = ?
         WHERE id = ? AND household_id = ? AND ((context = 'personal' AND owner_user_id = ?) OR (context = 'shared' AND owner_user_id IS NULL))`,
        name, emoji, color, id, user.household_id, req.user!.id
      );
    } else {
      await db.run(
        'INSERT INTO categories (household_id, name, emoji, color, context, owner_user_id) VALUES (?, ?, ?, ?, ?, ?)',
        user.household_id, name, emoji, color, nextContext, ownerUserId
      );
    }

    await notifyPartner(req.user!.id, req.user!.username,
      id ? 'category_updated' : 'category_created',
      id ? 'Categoría editada' : 'Nueva categoría',
      `{name} ${id ? 'editó' : 'creó'} la categoría "${name}" ${emoji}`,
      { category_name: name });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save category' });
  }
});

app.delete('/api/categories/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
    const existing = await db.get<{ name: string; emoji: string }>('SELECT name, emoji FROM categories WHERE id = ? AND household_id = ?', req.params.id, user.household_id);
    await db.run('DELETE FROM categories WHERE id = ? AND household_id = ?', req.params.id, user.household_id);

    // Notify partner
    if (existing) {
      await notifyPartner(req.user!.id, req.user!.username, 'category_deleted', 'Categoría eliminada',
        `{name} eliminó la categoría "${existing.name}" ${existing.emoji}`, { category_name: existing.name });
    }

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
