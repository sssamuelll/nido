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
  const token = req.cookies?.token;

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.sendStatus(403);
    }
    
    req.user = decoded as AuthUser;
    next();
  });
};