import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { logger } from '@veridion/logger';
import type { Queue } from 'bullmq';

import { CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AUDIT_QUEUE_NAME, type ScanAuditJobData } from './audits.queue';
import type { AuditQueryDto, CreateAuditDto } from './dto/audit.dto';

type AuditListResult = {
  data: unknown[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

@Injectable()
export class AuditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectQueue(AUDIT_QUEUE_NAME) private readonly scanQueue: Queue<ScanAuditJobData>,
  ) {}

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

    await this.cache.invalidateByPrefix(this.auditCachePrefix(userId));
    await this.cache.invalidate(`project:${userId}:${dto.projectId}`);
    logger.info({ auditId: audit.id, projectId: dto.projectId }, 'Audit created');

    // Enqueue async scan job
    await this.scanQueue.add(
      'scan-audit',
      {
        auditId: audit.id,
        projectId: dto.projectId,
        sourceCode: dto.sourceCode,
        contractPath: dto.contractPath,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );

    logger.info({ auditId: audit.id }, 'Scan job enqueued');

    return audit;
  }

  async findAll(userId: string, query: AuditQueryDto): Promise<AuditListResult> {
    const { page = 1, limit = 20, status, projectId } = query;
    const cacheKey = `${this.auditCachePrefix(userId)}${page}:${limit}:${status ?? ''}:${projectId ?? ''}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached !== null) return cached as AuditListResult;

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

    const result = {
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

    await this.cache.set(cacheKey, result, this.cache.getTtl('audits'));
    return result;
  }

  async findOne(id: string, userId: string): Promise<unknown> {
    const cacheKey = `audit:${userId}:${id}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached !== null) return cached;

    const audit = await this.prisma.db.audit.findUnique({
      where: { id },
      include: {
        project: { select: { name: true, userId: true } },
        findings: { orderBy: { severity: 'asc' } },
      },
    });

    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.project.userId !== userId) throw new ForbiddenException('Access denied');

    await this.cache.set(cacheKey, audit, this.cache.getTtl('audits'));
    return audit;
  }

  private auditCachePrefix(userId: string): string {
    return `audits:${userId}:`;
  }

  async updateFindingStatus(findingId: string, status: string, userId: string) {
    const validStatuses = ['OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE', 'RESOLVED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const finding = await this.prisma.db.auditFinding.findUnique({
      where: { id: findingId },
      include: { audit: { include: { project: { select: { userId: true } } } } },
    });

    if (!finding) throw new NotFoundException('Finding not found');
    if (finding.audit.project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.db.auditFinding.update({
      where: { id: findingId },
      data: { status },
    });

    logger.info({ findingId, status, userId }, 'Finding status updated');

    return updated;
  }
}
