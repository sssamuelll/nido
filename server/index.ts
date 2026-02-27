import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import './config.js'; // Validate environment first
import './db.js'; // Initialize database
import { login, authenticateToken, AuthRequest } from './auth.js';
import expensesRouter from './routes/expenses.js';
import budgetsRouter from './routes/budgets.js';
import { port } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Auth endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await login(username, password);
    
    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
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

// Catch-all handler: send back React's index.html file for client-side routing
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