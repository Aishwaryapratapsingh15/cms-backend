import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlogsService } from './blogs.service';

@Injectable()
export class BlogsScheduler {
  private readonly logger = new Logger(BlogsScheduler.name);

  constructor(private readonly blogsService: BlogsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePublishDueScheduledBlogs() {
    const published = await this.blogsService.publishDueScheduledBlogs();

    if (published.length > 0) {
      this.logger.log(
        `Published ${published.length} scheduled blog(s): ${published
          .map((blog) => blog.slug)
          .join(', ')}`,
      );
    }
  }
}
