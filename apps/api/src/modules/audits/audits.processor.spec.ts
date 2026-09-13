/* eslint-disable @typescript-eslint/unbound-method */
import { Test, type TestingModule } from '@nestjs/testing';
import { AuditStatus } from '@veridion/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditsProcessor } from './audits.processor';
import type { ScanAuditJobData } from './audits.queue';

const mockPrisma = {
  db: {
    project: {
      findUnique: jest.fn(),
    },
    auditFinding: {
      createMany: jest.fn(),
    },
    audit: {
      update: jest.fn(),
    },
  },
};

describe('AuditsProcessor', () => {
  let processor: AuditsProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditsProcessor, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    processor = module.get<AuditsProcessor>(AuditsProcessor);
  });

  it('should process a scan job successfully', async () => {
    const jobData: ScanAuditJobData = {
      auditId: 'audit-1',
      projectId: 'proj-1',
      sourceCode: 'contract MyContract {}',
    };

    const mockJob = {
      data: jobData,
      updateProgress: jest.fn(),
    } as unknown as Job<ScanAuditJobData>;

    mockPrisma.db.project.findUnique.mockResolvedValue({
      id: 'proj-1',
      name: 'Test Project',
      chain: 'ethereum',
      language: 'solidity',
      contracts: [],
    });

    mockPrisma.db.auditFinding.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.db.audit.update.mockResolvedValue({});

    await processor.process(mockJob);

    expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(70);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(90);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(100);

    // Verify status updates
    expect(mockPrisma.db.audit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'audit-1' },
        data: expect.objectContaining({ status: AuditStatus.SCANNING }),
      }),
    );

    expect(mockPrisma.db.audit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'audit-1' },
        data: expect.objectContaining({ status: AuditStatus.AI_REVIEW }),
      }),
    );

    expect(mockPrisma.db.audit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'audit-1' },
        data: expect.objectContaining({ status: AuditStatus.COMPLETED, securityScore: 100 }),
      }),
    );
  });
});
