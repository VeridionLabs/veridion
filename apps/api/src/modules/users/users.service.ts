import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        walletAddress: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { projects: true } },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    return this.prisma.db.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        walletAddress: dto.walletAddress,
      },
      select: {
        id: true, email: true, displayName: true, avatarUrl: true, walletAddress: true, role: true,
      },
    });
  }
}
