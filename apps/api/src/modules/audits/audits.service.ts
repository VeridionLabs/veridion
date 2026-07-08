import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { logger } from '@veridion/logger';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditQueryDto, CreateAuditDto } from './dto/audit.dto';

@Injectable()
export class AuditsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAuditDto) {
    const project = await this.prisma.db.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('Access denied');

    const audit = await this.prisma.db.audit.create({
      data: {
        projectId: dto.projectId,
        commitHash: dto.commitHash ?? null,
        status: 'PENDING',
      },
    });

    logger.info({ auditId: audit.id, projectId: dto.projectId }, 'Audit created');

    return audit;
  }

  async findAll(userId: string, query: AuditQueryDto) {
    const { page = 1, limit = 20, status, projectId } = query;
    const where = {
      project: { userId },
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.db.audit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { name: true } }, _count: { select: { findings: true } } },
      }),
      this.prisma.db.audit.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string, userId: string) {
    const audit = await this.prisma.db.audit.findUnique({
      where: { id },
      include: {
        project: { select: { name: true, userId: true } },
        findings: { orderBy: { severity: 'asc' } },
      },
    });

    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.project.userId !== userId) throw new ForbiddenException('Access denied');

    return audit;
  }
}
