import { Module } from '@nestjs/common';
import { BlogsController } from './blogs.controller';
import { BlogsService } from './blogs.service';
import { BlogsScheduler } from './blogs.scheduler';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [BlogsController],
  providers: [BlogsService, BlogsScheduler],
})
export class BlogsModule {}
