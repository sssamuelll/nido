import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import './config.js'; // Validate environment first
import './db.js'; // Initialize database
import { login, authenticateToken, AuthRequest, verifyPin } from './auth.js';
import expensesRouter from './routes/expenses.js';
import budgetsRouter from './routes/budgets.js';
import { port } from './config.js';
import { pinSchema } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cookieParser());

// Rate limiting for the login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Simple CSRF Protection for SPAs
const csrfCheck = (req: any, res: any, next: any) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  if (req.headers['x-nido-request'] === 'true') {
    return next();
  }
  return res.status(403).json({ error: 'Seguridad CSRF: Petición no autorizada' });
};

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nido-request'],
  credentials: true
}));
app.use(express.json());
app.use(csrfCheck);

// Auth endpoint
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

    // Set cookie and return user info
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
    });

    res.json({ user: result.user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify PIN endpoint (for quick access)
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

// Update PIN endpoint
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

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// Protected API routes
app.use('/api/expenses', authenticateToken, expensesRouter);
app.use('/api/budgets', authenticateToken, budgetsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the client build
const clientBuildPath = path.join(__dirname, '../client');
app.use(express.static(clientBuildPath));

// Catch-all handler
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Nido server running on port ${port}`);
  console.log(`📱 App: http://localhost:${port}`);
  console.log(`🔌 API: http://localhost:${port}/api`);
});