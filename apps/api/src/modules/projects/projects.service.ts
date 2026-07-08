import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    return this.prisma.db.project.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        repoUrl: dto.repoUrl ?? null,
        chain: dto.chain,
        language: dto.language,
        userId,
        organizationId: dto.organizationId ?? null,
      },
    });
  }

  async findAll(userId: string, query: ProjectQueryDto) {
    const { page = 1, limit = 20, search } = query;
    const where = {
      userId,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.db.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { audits: true, contracts: true } } },
      }),
      this.prisma.db.project.count({ where }),
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
    const project = await this.prisma.db.project.findUnique({
      where: { id },
      include: { _count: { select: { audits: true, contracts: true } } },
    });

    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('Access denied');

    return project;
  }

  async update(id: string, userId: string, dto: UpdateProjectDto) {
    await this.findOne(id, userId);

    return this.prisma.db.project.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.db.project.delete({ where: { id } });
    return { message: 'Project deleted' };
  }
}
