import 'dotenv/config';
import bcrypt from 'bcryptjs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import './config.js'; // Validate environment first
import { getDatabase, initDatabase, notifyPartner } from './db.js';
import {
  authenticateToken,
  AuthRequest,
  verifyPin,
  clearAuthCookies,
  revokeAppSession,
} from './auth.js';
import passkeyAuthRouter from './routes/passkey-auth.js';
import expensesRouter from './routes/expenses.js';
import householdBudgetRouter from './routes/household-budget.js';
import goalsRouter from './routes/goals.js';
import analyticsRouter from './routes/analytics.js';
import notificationsRouter from './routes/notifications.js';
import recurringRouter from './routes/recurring.js';
import cyclesRouter from './routes/cycles.js';
import eventsRouter from './routes/events.js';
import { port, appSessionCookieName, allowedOrigins, isProduction } from './config.js';
import { pinSchema } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cookieParser());

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
  origin: allowedOrigins ?? (isProduction ? false : '*'),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nido-request'],
  credentials: true
}));
app.use(express.json());
app.use(csrfCheck);

// Passkey auth routes (setup, login, register, invite)
app.use('/api/auth', passkeyAuthRouter);

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

  try {
    const isValid = await verifyPin(req.user!.id, pin);
    if (isValid) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'PIN incorrecto' });
    }
  } catch (error) {
    console.error('PIN verify error:', error);
    res.status(500).json({ error: 'Error del servidor' });
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

  try {
    const db = getDatabase();
    const hashedPin = bcrypt.hashSync(pin, 10);
    await db.run(
      `UPDATE users SET pin = ? WHERE id = (SELECT legacy_user_id FROM app_users WHERE id = ?)`,
      hashedPin, req.user!.id
    );
    res.json({ success: true, message: 'PIN actualizado correctamente' });
  } catch (error) {
    console.error('PIN update error:', error);
    res.status(500).json({ error: 'Error al actualizar el PIN' });
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

// General rate limit for all authenticated API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas peticiones, intenta de nuevo en un momento' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/expenses', authenticateToken, apiLimiter, expensesRouter);
app.use('/api/household/budget', authenticateToken, apiLimiter, householdBudgetRouter);
app.use('/api/goals', authenticateToken, apiLimiter, goalsRouter);
app.use('/api/analytics', authenticateToken, apiLimiter, analyticsRouter);
app.use('/api/notifications', authenticateToken, apiLimiter, notificationsRouter);
app.use('/api/recurring', authenticateToken, apiLimiter, recurringRouter);
app.use('/api/cycles', authenticateToken, apiLimiter, cyclesRouter);
app.use('/api/events', authenticateToken, apiLimiter, eventsRouter);

// Categories routes
app.get('/api/categories', authenticateToken, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const context = (req.query.context as string) === 'personal' ? 'personal' : 'shared';

    const categories = context === 'personal'
      ? await db.all<Array<{ id: number; name: string; emoji: string; color: string; budget_amount: number; context: string }>>(
          `SELECT id, name, emoji, color, budget_amount, context FROM categories
           WHERE household_id = ? AND context = 'personal' AND owner_user_id = ?`,
          user.household_id, req.user!.id
        )
      : await db.all<Array<{ id: number; name: string; emoji: string; color: string; budget_amount: number; context: string }>>(
          `SELECT id, name, emoji, color, budget_amount, context FROM categories
           WHERE household_id = ? AND context = 'shared' AND owner_user_id IS NULL`,
          user.household_id
        );

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

app.post('/api/categories', authenticateToken, apiLimiter, async (req: AuthRequest, res) => {
  const { name, emoji, color, id, budget_amount, context } = req.body;
  if (!name || !emoji || !color) return res.status(400).json({ error: 'Nombre, emoji y color son requeridos' });

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const nextContext = context === 'personal' ? 'personal' : 'shared';
    const ownerUserId = nextContext === 'personal' ? req.user!.id : null;
    const budgetAmt = typeof budget_amount === 'number' ? budget_amount : 0;

    // Validate budget overflow for shared categories
    if (nextContext === 'shared' && budgetAmt > 0) {
      const householdBudget = await db.get<{ total_amount: number }>(
        'SELECT total_amount FROM household_budget WHERE household_id = ?',
        user.household_id
      );
      if (householdBudget) {
        const excludeId = (id && id !== 0) ? id : -1;
        const otherAllocated = await db.get<{ total: number }>(
          `SELECT COALESCE(SUM(budget_amount), 0) AS total
           FROM categories
           WHERE context = 'shared' AND owner_user_id IS NULL AND household_id = ? AND id != ?`,
          user.household_id, excludeId
        );
        const totalAllocated = (otherAllocated?.total ?? 0) + budgetAmt;
        if (totalAllocated > householdBudget.total_amount) {
          return res.status(400).json({
            error: `El total asignado a categorías (${totalAllocated}) excede el presupuesto (${householdBudget.total_amount})`,
          });
        }
      }
    }

    if (id && id !== 0) {
      await db.run(
        `UPDATE categories SET name = ?, emoji = ?, color = ?, budget_amount = ?
         WHERE id = ? AND household_id = ?
         AND ((context = 'personal' AND owner_user_id = ?) OR (context = 'shared' AND owner_user_id IS NULL))`,
        name, emoji, color, budgetAmt, id, user.household_id, req.user!.id
      );
    } else {
      await db.run(
        `INSERT INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(household_id, name, context, COALESCE(owner_user_id, -1))
         DO UPDATE SET emoji = excluded.emoji, color = excluded.color, budget_amount = excluded.budget_amount`,
        user.household_id, name, emoji, color, budgetAmt, nextContext, ownerUserId
      );
    }

    await notifyPartner(req.user!.id, req.user!.username,
      id ? 'category_updated' : 'category_created',
      id ? 'Categoría editada' : 'Nueva categoría',
      `{name} ${id ? 'editó' : 'creó'} la categoría "${name}" ${emoji}`,
      { category_name: name });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar categoría' });
  }
});

app.delete('/api/categories/:id', authenticateToken, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const existing = await db.get<{ name: string; emoji: string }>(
      'SELECT name, emoji FROM categories WHERE id = ? AND household_id = ?',
      req.params.id, user.household_id
    );

    await db.run(
      'DELETE FROM categories WHERE id = ? AND household_id = ?',
      req.params.id, user.household_id
    );

    if (existing) {
      await notifyPartner(req.user!.id, req.user!.username, 'category_deleted', 'Categoría eliminada',
        `{name} eliminó la categoría "${existing.name}" ${existing.emoji}`, { category_name: existing.name });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

// Household members
app.get('/api/household/members', authenticateToken, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const members = await db.all(
      'SELECT id, username FROM app_users WHERE household_id = ?',
      user.household_id
    );
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener miembros' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const clientBuildPath = path.join(__dirname, '../client');
app.use(express.static(clientBuildPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint de API no encontrado' });
  }
  // Don't serve index.html for missing static assets (prevents MIME type mismatch)
  if (req.path.startsWith('/assets/') || req.path.match(/\.(js|css|map|png|jpg|svg|ico|woff2?)$/)) {
    return res.status(404).end();
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
