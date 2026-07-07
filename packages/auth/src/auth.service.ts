import bcrypt from 'bcryptjs';

import { prisma } from '@veridion/database';
import { logger } from '@veridion/logger';

import { JwtService } from './jwt.service';
import type { AuthConfig, JwtPayload, TokenPair } from './types';

export class AuthService {
  private readonly jwtService: JwtService;

  constructor(private readonly config: AuthConfig) {
    this.jwtService = new JwtService(config);
  }

  async register(email: string, password: string, displayName?: string): Promise<TokenPair> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, this.config.bcryptRounds);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: displayName ?? null,
      },
    });

    logger.info({ userId: user.id }, 'User registered');

    const tokens = this.jwtService.signTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.storeSession(user.id, tokens.refreshToken);

    return tokens;
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: user.id }, 'User logged in');

    const tokens = this.jwtService.signTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.storeSession(user.id, tokens.refreshToken);

    return tokens;
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    const session = await prisma.session.findUnique({
      where: { refreshToken },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new Error('User not found or deactivated');
    }

    // Rotate refresh token
    await prisma.session.delete({ where: { id: session.id } });

    const tokens = this.jwtService.signTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.storeSession(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await prisma.session.deleteMany({
        where: { userId, refreshToken },
      });
    } else {
      await prisma.session.deleteMany({
        where: { userId },
      });
    }

    logger.info({ userId }, 'User logged out');
  }

  async validateUser(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAccessToken(token);
  }

  private async storeSession(userId: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId,
        token: refreshToken,
        refreshToken,
        expiresAt,
      },
    });
  }
}
