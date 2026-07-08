import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { logger } from '@veridion/logger';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.db.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.db.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? null,
      },
    });

    logger.info({ userId: user.id }, 'User registered');

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.db.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: user.id }, 'User logged in');

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });

      const user = await this.prisma.db.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or deactivated');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(_userId: string): Promise<{ message: string }> {
    return { message: 'Logged out successfully' };
  }

  private generateTokens(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRATION') ?? '7d',
    });

    return { accessToken, refreshToken };
  }
}
