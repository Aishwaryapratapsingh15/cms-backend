import { Test, TestingModule } from '@nestjs/testing';
import { BlogsScheduler } from './blogs.scheduler';
import { BlogsService } from './blogs.service';
import { AuditLogService } from '../audit/audit-log.service';

describe('BlogsScheduler', () => {
  let scheduler: BlogsScheduler;
  let blogsService: { publishDueScheduledBlogs: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(async () => {
    blogsService = { publishDueScheduledBlogs: jest.fn() };
    auditLogService = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogsScheduler,
        { provide: BlogsService, useValue: blogsService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    scheduler = module.get<BlogsScheduler>(BlogsScheduler);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  it('delegates to BlogsService.publishDueScheduledBlogs', async () => {
    blogsService.publishDueScheduledBlogs.mockResolvedValue([]);

    await scheduler.handlePublishDueScheduledBlogs();

    expect(blogsService.publishDueScheduledBlogs).toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('writes a system PUBLISH audit entry per published blog', async () => {
    blogsService.publishDueScheduledBlogs.mockResolvedValue([
      { id: 'blog-1', slug: 'first-post' },
      { id: 'blog-2', slug: 'second-post' },
    ]);

    await scheduler.handlePublishDueScheduledBlogs();

    expect(auditLogService.record).toHaveBeenCalledTimes(2);
    expect(auditLogService.record).toHaveBeenCalledWith({
      action: 'PUBLISH',
      entity: 'Blog',
      entityId: 'blog-1',
    });
  });

  it('never throws when publishing fails, and runs again on the next tick', async () => {
    blogsService.publishDueScheduledBlogs
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([]);

    await expect(
      scheduler.handlePublishDueScheduledBlogs(),
    ).resolves.toBeUndefined();
    await scheduler.handlePublishDueScheduledBlogs();

    expect(blogsService.publishDueScheduledBlogs).toHaveBeenCalledTimes(2);
  });

  it('skips a tick while the previous one is still running', async () => {
    let release!: (v: unknown[]) => void;
    blogsService.publishDueScheduledBlogs.mockReturnValueOnce(
      new Promise((resolve) => (release = resolve)),
    );

    const first = scheduler.handlePublishDueScheduledBlogs();
    await scheduler.handlePublishDueScheduledBlogs();

    expect(blogsService.publishDueScheduledBlogs).toHaveBeenCalledTimes(1);

    release([]);
    await first;
  });
});
