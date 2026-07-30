import { Test, TestingModule } from '@nestjs/testing';
import { BlogsScheduler } from './blogs.scheduler';
import { BlogsService } from './blogs.service';

describe('BlogsScheduler', () => {
  let scheduler: BlogsScheduler;
  let blogsService: { publishDueScheduledBlogs: jest.Mock };

  beforeEach(async () => {
    blogsService = { publishDueScheduledBlogs: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogsScheduler,
        { provide: BlogsService, useValue: blogsService },
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
  });

  it('does not throw when blogs were published', async () => {
    blogsService.publishDueScheduledBlogs.mockResolvedValue([
      { id: 'blog-1', slug: 'first-post' },
    ]);

    await expect(scheduler.handlePublishDueScheduledBlogs()).resolves.not.toThrow();
  });
});
