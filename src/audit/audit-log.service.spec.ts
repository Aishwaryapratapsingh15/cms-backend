import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: {
    auditLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('writes an audit log row', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.record({
        userId: 'user-id',
        action: 'CREATE',
        entity: 'Blog',
        entityId: 'blog-id',
        ipAddress: '127.0.0.1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id',
          action: 'CREATE',
          entity: 'Blog',
          entityId: 'blog-id',
          ipAddress: '127.0.0.1',
        },
      });
    });

    it('swallows a DB failure instead of throwing', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.record({ action: 'CREATE', entity: 'Blog' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('applies entity/action/userId filters, pagination, and orders by createdAt', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      prisma.auditLog.count.mockResolvedValue(1);

      const query: ListAuditLogsQueryDto = {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        entity: 'Blog',
        action: 'PUBLISH',
        userId: 'user-id',
      };
      const result = await service.findAll(query);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entity: 'Blog', action: 'PUBLISH', userId: 'user-id' },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('applies no filters when none are provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, sortOrder: 'desc' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
