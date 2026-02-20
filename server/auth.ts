import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nido-secret-key-2026';

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// Login function
export const login = async (username: string, password: string): Promise<{ token: string; user: AuthUser } | null> => {
  try {
    const db = getDatabase();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return null;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      token,
      user: { id: user.id, username: user.username }
    };
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
};

// JWT middleware
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.sendStatus(403);
    }
    
    req.user = decoded as AuthUser;
    next();
  });
};