import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from '../audit/audit-log.service';
import { BlogsService } from './blogs.service';

@Injectable()
export class BlogsScheduler {
  private readonly logger = new Logger(BlogsScheduler.name);
  private isRunning = false;

  constructor(
    private readonly blogsService: BlogsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'publish-due-scheduled-blogs' })
  async handlePublishDueScheduledBlogs() {
    // A slow tick must not overlap the next one in this process.
    if (this.isRunning) {
      this.logger.warn(
        'Previous publish run still in progress; skipping tick.',
      );
      return;
    }

    this.isRunning = true;
    try {
      const published = await this.blogsService.publishDueScheduledBlogs();

      if (published.length === 0) {
        return;
      }

      this.logger.log(
        `Published ${published.length} scheduled blog(s): ${published
          .map((blog) => blog.slug)
          .join(', ')}`,
      );

      // No request/user exists for a timer-driven publish, so userId is
      // intentionally left unset (system action).
      await Promise.all(
        published.map((blog) =>
          this.auditLogService.record({
            action: 'PUBLISH',
            entity: 'Blog',
            entityId: blog.id,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        'Scheduled blog publishing failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
