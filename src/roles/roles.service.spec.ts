import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: { role: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { role: { findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('lists roles ordered by name, selecting only id/name/description', async () => {
      const roles = [
        { id: '1', name: 'ADMIN', description: 'Full system access' },
        { id: '2', name: 'EDITOR', description: 'Can manage content' },
      ];
      prisma.role.findMany.mockResolvedValue(roles);

      const result = await service.findAll();

      expect(result).toEqual(roles);
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
      });
    });
  });
});
