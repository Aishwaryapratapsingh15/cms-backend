import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

describe('AuditController', () => {
  let controller: AuditController;
  let auditLogService: { findAll: jest.Mock };

  beforeEach(async () => {
    auditLogService = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditLogService, useValue: auditLogService }],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to AuditLogService.findAll', () => {
    const query = { page: 1, limit: 10 } as ListAuditLogsQueryDto;
    controller.findAll(query);

    expect(auditLogService.findAll).toHaveBeenCalledWith(query);
  });
});
