import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
  constructor(private readonly prisma: PrismaService) {
    super({ header: 'X-API-Key', prefix: '' }, true, async (apiKey: string, done: (err: Error | null, user?: unknown) => void) => {
      try {
        const key = await this.prisma.db.apiKey.findUnique({ where: { key: apiKey } });

        if (!key || !key.isActive) {
          return done(new UnauthorizedException('Invalid API key'), false);
        }

        if (key.expiresAt && key.expiresAt < new Date()) {
          return done(new UnauthorizedException('API key expired'), false);
        }

        return done(null, { id: key.userId, permissions: key.permissions });
      } catch (error) {
        return done(error as Error, false);
      }
    });
  }
}
