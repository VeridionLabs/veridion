import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.db.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }
}
