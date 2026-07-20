import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateApiKeyDto } from './dto/api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string) {
    return this.prisma.db.apiKey.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateApiKeyDto) {
    const generatedKey = `ver_${randomBytes(24).toString('hex')}`;

    const apiKey = await this.prisma.db.apiKey.create({
      data: {
        userId,
        name: dto.name,
        key: generatedKey,
        permissions: ['read'],
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: apiKey.key,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }

  async revoke(userId: string, keyId: string) {
    const key = await this.prisma.db.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key || !key.isActive) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.db.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    return { message: 'API key revoked successfully' };
  }
}
