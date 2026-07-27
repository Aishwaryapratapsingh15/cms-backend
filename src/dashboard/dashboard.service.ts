import { Injectable } from '@nestjs/common';
import { BlogStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type BlogsByStatus = Record<BlogStatus, number>;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalUsers, totalBlogs, totalCategories, viewsAggregate, statusGroups] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.blog.count({ where: { deletedAt: null } }),
        this.prisma.category.count(),
        this.prisma.blog.aggregate({
          where: { deletedAt: null },
          _sum: { views: true },
        }),
        this.prisma.blog.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: true,
        }),
      ]);

    const blogsByStatus = Object.values(BlogStatus).reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as BlogsByStatus);

    for (const group of statusGroups) {
      blogsByStatus[group.status] = group._count;
    }

    return {
      totalUsers,
      totalBlogs,
      totalCategories,
      totalViews: viewsAggregate._sum.views ?? 0,
      blogsByStatus,
    };
  }
}
