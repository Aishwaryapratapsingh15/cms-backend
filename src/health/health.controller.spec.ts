import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: jest.Mock };

  beforeEach(async () => {
    healthService = { check: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('returns the service result when healthy', async () => {
      const result = { status: 'ok', uptime: 123, timestamp: 'now' };
      healthService.check.mockResolvedValue(result);

      await expect(controller.check()).resolves.toEqual(result);
    });

    it('throws ServiceUnavailableException when the service check fails', async () => {
      healthService.check.mockRejectedValue(new Error('DB down'));

      await expect(controller.check()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
