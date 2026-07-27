import { Test, TestingModule } from '@nestjs/testing';
import { BlogStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    user: { count: jest.Mock };
    blog: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
    category: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { count: jest.fn() },
      blog: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
      category: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('assembles totals, sum of views, and a zero-filled status breakdown', async () => {
      prisma.user.count.mockResolvedValue(5);
      prisma.blog.count.mockResolvedValue(10);
      prisma.category.count.mockResolvedValue(3);
      prisma.blog.aggregate.mockResolvedValue({ _sum: { views: 42 } });
      prisma.blog.groupBy.mockResolvedValue([
        { status: BlogStatus.DRAFT, _count: 4 },
        { status: BlogStatus.PUBLISHED, _count: 6 },
      ]);

      const result = await service.getStats();

      expect(result).toEqual({
        totalUsers: 5,
        totalBlogs: 10,
        totalCategories: 3,
        totalViews: 42,
        blogsByStatus: {
          DRAFT: 4,
          PUBLISHED: 6,
          SCHEDULED: 0,
          ARCHIVED: 0,
        },
      });
    });

    it('excludes soft-deleted users and blogs from counts', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.blog.count.mockResolvedValue(0);
      prisma.category.count.mockResolvedValue(0);
      prisma.blog.aggregate.mockResolvedValue({ _sum: { views: null } });
      prisma.blog.groupBy.mockResolvedValue([]);

      await service.getStats();

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
      expect(prisma.blog.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
      expect(prisma.blog.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      expect(prisma.blog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });

    it('defaults totalViews to 0 when the sum is null (no blogs yet)', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.blog.count.mockResolvedValue(0);
      prisma.category.count.mockResolvedValue(0);
      prisma.blog.aggregate.mockResolvedValue({ _sum: { views: null } });
      prisma.blog.groupBy.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result.totalViews).toBe(0);
      expect(result.blogsByStatus).toEqual({
        DRAFT: 0,
        PUBLISHED: 0,
        SCHEDULED: 0,
        ARCHIVED: 0,
      });
    });
  });
});
