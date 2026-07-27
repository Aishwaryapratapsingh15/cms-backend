import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export interface RecordAuditParams {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { ...params } });
    } catch (error) {
      this.logger.error(
        'Failed to write audit log entry',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll(query: ListAuditLogsQueryDto) {
    const { page, limit, entity, action, userId, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(entity && { entity }),
      ...(action && { action }),
      ...(userId && { userId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
