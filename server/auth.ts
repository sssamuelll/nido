import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from './db.js';
import { jwtSecret } from './config.js';

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  validatedData?: any;
  validatedMonth?: string;
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
      jwtSecret,
      { expiresIn: '365d' }
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

// Verify PIN function
export const verifyPin = async (username: string, pin: string): Promise<boolean> => {
  try {
    const db = getDatabase();
    const user = await db.get('SELECT pin FROM users WHERE username = ?', username);
    return user && user.pin === pin;
  } catch (error) {
    console.error('PIN verify error:', error);
    return false;
  }
};

// JWT middleware
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const cookieToken = req.cookies?.token;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  jwt.verify(token, jwtSecret, (err: any, decoded: any) => {
    if (err) {
      return res.status(401).json({ error: 'Session expired' });
    }
    
    req.user = decoded as AuthUser;
    next();
  });
};