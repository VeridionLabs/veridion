import jwt from 'jsonwebtoken';

import type { AuthConfig, JwtPayload, TokenPair } from './types';

export class JwtService {
  constructor(private readonly config: AuthConfig) {}

  signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign({ ...payload }, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiration as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  }

  signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign({ ...payload }, this.config.jwtRefreshSecret, {
      expiresIn: this.config.jwtRefreshExpiration as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  }

  signTokenPair(payload: Omit<JwtPayload, 'iat' | 'exp'>): TokenPair {
    return {
      accessToken: this.signAccessToken(payload),
      refreshToken: this.signRefreshToken(payload),
    };
  }

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, this.config.jwtSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;
  }

  verifyRefreshToken(token: string): JwtPayload {
    return jwt.verify(token, this.config.jwtRefreshSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;
  }
}
