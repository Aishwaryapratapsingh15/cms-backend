import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlogStatus } from '@prisma/client';
import { BlogsService } from './blogs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { ListBlogsQueryDto } from './dto/list-blogs-query.dto';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('BlogsService', () => {
  let service: BlogsService;
  let prisma: {
    blog: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    blogVersion: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    blogCategory: { deleteMany: jest.Mock; createMany: jest.Mock };
    blogTag: { deleteMany: jest.Mock; createMany: jest.Mock };
    blogFaq: { deleteMany: jest.Mock; createMany: jest.Mock };
    category: { count: jest.Mock };
    tag: { count: jest.Mock };
    media: { findUnique: jest.Mock };
    rolePermission: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };

  const authorId = 'author-id';
  // Same id as the blog's authorId in withRelations() below, so ownership
  // checks pass by default; rolePermission.findFirst defaults to "granted"
  // (see beforeEach) so this actor behaves like ADMIN/EDITOR unless a specific
  // test overrides it to verify the AUTHOR-style restrictions.
  const actor = { id: authorId, roleId: 'actor-role-id' } as AuthenticatedUser;

  const withRelations = (overrides: Record<string, unknown> = {}) => ({
    id: 'blog-id',
    authorId,
    title: 'How to build a CMS',
    slug: 'how-to-build-a-cms',
    excerpt: 'An intro',
    content: 'word '.repeat(50).trim(),
    status: BlogStatus.DRAFT,
    publishedAt: null,
    scheduledAt: null,
    archivedAt: null,
    views: 0,
    readingTime: 1,
    author: { id: authorId, fullName: 'Jane Doe', email: 'jane@example.com' },
    categories: [{ category: { id: 'cat-1', name: 'Tech', slug: 'tech' } }],
    tags: [{ tag: { id: 'tag-1', name: 'NestJS', slug: 'nestjs' } }],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      blog: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      blogVersion: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      blogCategory: { deleteMany: jest.fn(), createMany: jest.fn() },
      blogTag: { deleteMany: jest.fn(), createMany: jest.fn() },
      blogFaq: { deleteMany: jest.fn(), createMany: jest.fn() },
      category: { count: jest.fn() },
      tag: { count: jest.fn() },
      media: { findUnique: jest.fn() },
      rolePermission: {
        findFirst: jest.fn().mockResolvedValue({ id: 'grant-id' }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma),
    );

    configService = {
      get: jest.fn().mockReturnValue(undefined),
      getOrThrow: jest.fn().mockReturnValue('cdn.example.com'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BlogsService>(BlogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateBlogDto = {
      title: 'How to build a CMS',
      content: 'word '.repeat(50).trim(),
    };

    it('auto-generates a slug from the title when omitted', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      await service.create(dto, actor);

      expect(prisma.blog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'how-to-build-a-cms' }),
        }),
      );
    });

    it('creates faqs with their index as position', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      await service.create(
        {
          ...dto,
          faqs: [
            { question: 'What is EiceRise?', answer: 'A hospitality ERP.' },
            { question: 'Who is it for?', answer: 'Hotels in India.' },
          ],
        },
        actor,
      );

      expect(prisma.blog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            faqs: {
              create: [
                {
                  question: 'What is EiceRise?',
                  answer: 'A hospitality ERP.',
                  position: 0,
                },
                {
                  question: 'Who is it for?',
                  answer: 'Hotels in India.',
                  position: 1,
                },
              ],
            },
          }),
        }),
      );
    });

    it('omits the faqs relation entirely when none are given', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      await service.create(dto, actor);

      expect(prisma.blog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ faqs: undefined }),
        }),
      );
    });

    it('computes readingTime from content word count', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      await service.create(dto, actor);

      expect(prisma.blog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ readingTime: 1 }),
        }),
      );
    });

    it('throws ConflictException when an explicit slug is already taken', async () => {
      prisma.blog.findUnique.mockResolvedValue({ id: 'other-id' });

      await expect(
        service.create({ ...dto, slug: 'how-to-build-a-cms' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for SCHEDULED without a future scheduledAt', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...dto, status: BlogStatus.SCHEDULED }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a DRAFT with no content at all', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations({ content: '' }));

      await expect(
        service.create({ title: dto.title }, actor),
      ).resolves.toBeDefined();

      expect(prisma.blog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: '' }),
        }),
      );
    });

    it('throws BadRequestException when publishing with no content', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          { title: dto.title, status: BlogStatus.PUBLISHED },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.blog.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scheduling with only whitespace content', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await expect(
        service.create(
          {
            title: dto.title,
            content: '   ',
            status: BlogStatus.SCHEDULED,
            scheduledAt: futureDate,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.blog.create).not.toHaveBeenCalled();
    });

    it('sets publishedAt when status is PUBLISHED', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      await service.create({ ...dto, status: BlogStatus.PUBLISHED }, actor);

      expect(prisma.blog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws ForbiddenException when the actor lacks blogs:publish and requests a non-DRAFT status', async () => {
      prisma.rolePermission.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ ...dto, status: BlogStatus.PUBLISHED }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.blog.create).not.toHaveBeenCalled();
    });

    it('allows creating a DRAFT even without blogs:publish', async () => {
      prisma.rolePermission.findFirst.mockResolvedValue(null);
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      await expect(service.create(dto, actor)).resolves.toBeDefined();
    });

    it('throws BadRequestException when a categoryId does not exist', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.category.count.mockResolvedValue(0);

      await expect(
        service.create({ ...dto, categoryIds: ['missing-cat'] }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('flattens categories/tags in the returned blog', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(withRelations());

      const result = await service.create(dto, actor);

      expect(result.categories).toEqual([
        { id: 'cat-1', name: 'Tech', slug: 'tech' },
      ]);
      expect(result.tags).toEqual([
        { id: 'tag-1', name: 'NestJS', slug: 'nestjs' },
      ]);
      expect(result).not.toHaveProperty('categories.0.category');
    });

    it('resolves featuredMedia into a CloudFront url when present', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.media.findUnique.mockResolvedValue({ id: 'media-1' });
      prisma.blog.create.mockResolvedValue(
        withRelations({
          featuredMedia: {
            id: 'media-1',
            s3Key: 'media/hero.jpg',
            altText: 'Hero image',
            width: 1200,
            height: 630,
          },
        }),
      );

      const result = await service.create(
        { ...dto, featuredMediaId: 'media-1' },
        actor,
      );

      expect(result.featuredMedia).toEqual({
        id: 'media-1',
        s3Key: 'media/hero.jpg',
        altText: 'Hero image',
        width: 1200,
        height: 630,
        url: 'https://cdn.example.com/hero.jpg',
      });
    });

    it('leaves featuredMedia null when there is no featured image', async () => {
      prisma.blog.findUnique.mockResolvedValue(null);
      prisma.blog.create.mockResolvedValue(
        withRelations({ featuredMedia: null }),
      );

      const result = await service.create(dto, actor);

      expect(result.featuredMedia).toBeNull();
    });

    describe('SEO auto-fill', () => {
      it('derives seoTitle from title and seoDescription from excerpt when omitted', async () => {
        prisma.blog.findUnique.mockResolvedValue(null);
        prisma.blog.create.mockResolvedValue(withRelations());

        await service.create({ ...dto, excerpt: 'An intro' }, actor);

        expect(prisma.blog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              seoTitle: 'How to build a CMS',
              seoDescription: 'An intro',
            }),
          }),
        );
      });

      it('derives seoDescription from stripped content when there is no excerpt', async () => {
        prisma.blog.findUnique.mockResolvedValue(null);
        prisma.blog.create.mockResolvedValue(withRelations());

        await service.create(
          { ...dto, excerpt: undefined, content: '# Title\nSome body text' },
          actor,
        );

        expect(prisma.blog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              seoDescription: 'Title Some body text',
            }),
          }),
        );
      });

      it('leaves explicit seoTitle/seoDescription/canonicalUrl untouched', async () => {
        prisma.blog.findUnique.mockResolvedValue(null);
        prisma.blog.create.mockResolvedValue(withRelations());

        await service.create(
          {
            ...dto,
            seoTitle: 'Custom SEO Title',
            seoDescription: 'Custom SEO description',
            canonicalUrl: 'https://custom.example.com/post',
          },
          actor,
        );

        expect(prisma.blog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              seoTitle: 'Custom SEO Title',
              seoDescription: 'Custom SEO description',
              canonicalUrl: 'https://custom.example.com/post',
            }),
          }),
        );
      });

      it('builds canonicalUrl from PUBLIC_SITE_URL and the slug when configured', async () => {
        configService.get.mockReturnValue('https://example.com/');
        prisma.blog.findUnique.mockResolvedValue(null);
        prisma.blog.create.mockResolvedValue(withRelations());

        await service.create(dto, actor);

        expect(prisma.blog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              canonicalUrl: 'https://example.com/blog/how-to-build-a-cms',
            }),
          }),
        );
      });

      it('leaves canonicalUrl undefined when PUBLIC_SITE_URL is not configured', async () => {
        configService.get.mockReturnValue(undefined);
        prisma.blog.findUnique.mockResolvedValue(null);
        prisma.blog.create.mockResolvedValue(withRelations());

        await service.create(dto, actor);

        expect(prisma.blog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ canonicalUrl: undefined }),
          }),
        );
      });
    });
  });

  describe('findAll', () => {
    it('paginates, filters by status, and applies search', async () => {
      prisma.blog.findMany.mockResolvedValue([withRelations()]);
      prisma.blog.count.mockResolvedValue(1);

      const query: ListBlogsQueryDto = {
        page: 1,
        limit: 10,
        search: 'cms',
        status: BlogStatus.DRAFT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };
      const result = await service.findAll(query);

      expect(prisma.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            status: BlogStatus.DRAFT,
          }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result.meta.total).toBe(1);
      expect(result.items[0].categories).toEqual([
        { id: 'cat-1', name: 'Tech', slug: 'tech' },
      ]);
    });
  });

  describe('findPublished', () => {
    it('forces status to PUBLISHED regardless of the query', async () => {
      prisma.blog.findMany.mockResolvedValue([
        withRelations({ status: BlogStatus.PUBLISHED }),
      ]);
      prisma.blog.count.mockResolvedValue(1);

      const query: ListBlogsQueryDto = {
        page: 1,
        limit: 10,
        status: BlogStatus.DRAFT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };
      await service.findPublished(query);

      expect(prisma.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            status: BlogStatus.PUBLISHED,
          }),
        }),
      );
    });
  });

  describe('publishDueScheduledBlogs', () => {
    const scheduledAt = new Date('2026-07-30T09:00:00.000Z');

    it('queries only due, non-deleted SCHEDULED blogs, oldest first, capped', async () => {
      prisma.blog.findMany.mockResolvedValue([]);

      await service.publishDueScheduledBlogs();

      expect(prisma.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: BlogStatus.SCHEDULED,
            scheduledAt: { lte: expect.any(Date) },
            deletedAt: null,
          },
          orderBy: { scheduledAt: 'asc' },
          take: 100,
        }),
      );
    });

    it('claims each due blog atomically, using its own scheduledAt as publishedAt', async () => {
      prisma.blog.findMany.mockResolvedValue([
        { id: 'blog-1', slug: 'first-post', scheduledAt },
        { id: 'blog-2', slug: 'second-post', scheduledAt },
      ]);
      prisma.blog.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.publishDueScheduledBlogs();

      expect(prisma.blog.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.blog.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'blog-1',
          status: BlogStatus.SCHEDULED,
          scheduledAt,
          deletedAt: null,
        },
        data: {
          status: BlogStatus.PUBLISHED,
          publishedAt: scheduledAt,
          scheduledAt: null,
        },
      });
      expect(result).toEqual([
        { id: 'blog-1', slug: 'first-post' },
        { id: 'blog-2', slug: 'second-post' },
      ]);
    });

    it('skips a blog that was edited/claimed concurrently (count 0)', async () => {
      prisma.blog.findMany.mockResolvedValue([
        { id: 'blog-1', slug: 'first-post', scheduledAt },
      ]);
      prisma.blog.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.publishDueScheduledBlogs();

      expect(result).toEqual([]);
    });

    it('isolates a failing blog and still publishes the rest', async () => {
      prisma.blog.findMany.mockResolvedValue([
        { id: 'blog-1', slug: 'first-post', scheduledAt },
        { id: 'blog-2', slug: 'second-post', scheduledAt },
      ]);
      prisma.blog.updateMany
        .mockRejectedValueOnce(new Error('db hiccup'))
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.publishDueScheduledBlogs();

      expect(result).toEqual([{ id: 'blog-2', slug: 'second-post' }]);
    });

    it('does nothing when no scheduled blogs are due', async () => {
      prisma.blog.findMany.mockResolvedValue([]);

      const result = await service.publishDueScheduledBlogs();

      expect(prisma.blog.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing', async () => {
      prisma.blog.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySlug', () => {
    it('throws NotFoundException when not published', async () => {
      prisma.blog.findFirst.mockResolvedValue(null);

      await expect(service.findBySlug('unpublished')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.blog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: BlogStatus.PUBLISHED }),
        }),
      );
    });

    it('increments views and returns the published blog', async () => {
      const published = withRelations({
        status: BlogStatus.PUBLISHED,
        views: 4,
      });
      prisma.blog.findFirst.mockResolvedValue(published);
      prisma.blog.update.mockResolvedValue({});

      const result = await service.findBySlug('how-to-build-a-cms');

      expect(prisma.blog.update).toHaveBeenCalledWith({
        where: { id: published.id },
        data: { views: { increment: 1 } },
      });
      expect(result.views).toBe(5);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the blog does not exist', async () => {
      prisma.blog.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { title: 'New Title' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a BlogVersion snapshot when content fields change', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(
        withRelations({ title: 'New Title' }),
      );

      await service.update(existing.id, { title: 'New Title' }, actor);

      expect(prisma.blogVersion.create).toHaveBeenCalledWith({
        data: {
          blogId: existing.id,
          editedById: authorId,
          title: existing.title,
          excerpt: existing.excerpt,
          content: existing.content,
        },
      });
    });

    it('skips the version snapshot for metadata-only changes', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(withRelations({ isFeatured: true }));

      await service.update(existing.id, { isFeatured: true }, actor);

      expect(prisma.blogVersion.create).not.toHaveBeenCalled();
    });

    it('full-replaces categories when categoryIds is provided', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.category.count.mockResolvedValue(1);
      prisma.blog.update.mockResolvedValue(withRelations());

      await service.update(existing.id, { categoryIds: ['cat-2'] }, actor);

      expect(prisma.blogCategory.deleteMany).toHaveBeenCalledWith({
        where: { blogId: existing.id },
      });
      expect(prisma.blogCategory.createMany).toHaveBeenCalledWith({
        data: [{ blogId: existing.id, categoryId: 'cat-2' }],
      });
    });

    it('full-replaces faqs when faqs is provided', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(withRelations());

      await service.update(
        existing.id,
        { faqs: [{ question: 'New question?', answer: 'New answer.' }] },
        actor,
      );

      expect(prisma.blogFaq.deleteMany).toHaveBeenCalledWith({
        where: { blogId: existing.id },
      });
      expect(prisma.blogFaq.createMany).toHaveBeenCalledWith({
        data: [
          {
            blogId: existing.id,
            question: 'New question?',
            answer: 'New answer.',
            position: 0,
          },
        ],
      });
    });

    it('clears all faqs when an empty faqs array is provided', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(withRelations());

      await service.update(existing.id, { faqs: [] }, actor);

      expect(prisma.blogFaq.deleteMany).toHaveBeenCalledWith({
        where: { blogId: existing.id },
      });
      expect(prisma.blogFaq.createMany).not.toHaveBeenCalled();
    });

    it('leaves faqs untouched when faqs is omitted from the update', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(withRelations());

      await service.update(existing.id, { title: 'New Title' }, actor);

      expect(prisma.blogFaq.deleteMany).not.toHaveBeenCalled();
      expect(prisma.blogFaq.createMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for SCHEDULED without a future scheduledAt', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);

      await expect(
        service.update(existing.id, { status: BlogStatus.SCHEDULED }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when publishing a draft that has no content', async () => {
      const existing = withRelations({ content: '' });
      prisma.blog.findFirst.mockResolvedValue(existing);

      await expect(
        service.update(existing.id, { status: BlogStatus.PUBLISHED }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.blog.update).not.toHaveBeenCalled();
    });

    it('allows publishing when new content is supplied in the same update', async () => {
      const existing = withRelations({ content: '' });
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(
        withRelations({ status: BlogStatus.PUBLISHED }),
      );

      await expect(
        service.update(
          existing.id,
          { status: BlogStatus.PUBLISHED, content: 'Now it has content.' },
          actor,
        ),
      ).resolves.toBeDefined();
    });

    it('clears publishedAt when moving an already-published blog to SCHEDULED', async () => {
      const existing = withRelations({
        status: BlogStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(withRelations());

      const futureDate = new Date(Date.now() + 86_400_000).toISOString();
      await service.update(
        existing.id,
        { status: BlogStatus.SCHEDULED, scheduledAt: futureDate },
        actor,
      );

      expect(prisma.blog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: BlogStatus.SCHEDULED,
            publishedAt: null,
            scheduledAt: new Date(futureDate),
          }),
        }),
      );
    });

    it('throws ForbiddenException when the actor is not the author and lacks blogs:manage-all', async () => {
      const existing = withRelations({ authorId: 'someone-else-id' });
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.rolePermission.findFirst.mockResolvedValue(null);

      await expect(
        service.update(existing.id, { title: 'New Title' }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.blog.update).not.toHaveBeenCalled();
    });

    it("allows editing another author's blog when the actor has blogs:manage-all", async () => {
      const existing = withRelations({ authorId: 'someone-else-id' });
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.rolePermission.findFirst.mockResolvedValue({ id: 'grant-id' });
      prisma.blog.update.mockResolvedValue(
        withRelations({ title: 'New Title' }),
      );

      await expect(
        service.update(existing.id, { title: 'New Title' }, actor),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when the actor lacks blogs:publish and requests a non-DRAFT status', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.rolePermission.findFirst.mockResolvedValue(null);

      await expect(
        service.update(existing.id, { status: BlogStatus.PUBLISHED }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.blog.update).not.toHaveBeenCalled();
    });

    it("allows a DRAFT-only edit even without blogs:publish, on the actor's own blog", async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.rolePermission.findFirst.mockResolvedValue(null);
      prisma.blog.update.mockResolvedValue(
        withRelations({ title: 'New Title' }),
      );

      await expect(
        service.update(existing.id, { title: 'New Title' }, actor),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the blog does not exist', async () => {
      prisma.blog.findFirst.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes, setting deletedAt and mangling the slug', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue({});

      await service.remove('blog-id');

      expect(prisma.blog.update).toHaveBeenCalledWith({
        where: { id: 'blog-id' },
        data: {
          deletedAt: expect.any(Date),
          slug: expect.stringContaining(existing.slug),
        },
      });
    });

    it('frees up the slug so it can be reused after deletion', async () => {
      const existing = withRelations();
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue({});

      await service.remove('blog-id');

      const call = prisma.blog.update.mock.calls[0][0];
      expect(call.data.slug).not.toBe(existing.slug);
      expect(call.data.slug).toMatch(/^deleted-\d+-.+/);
    });
  });

  describe('listVersions', () => {
    it('throws NotFoundException when the blog does not exist', async () => {
      prisma.blog.findFirst.mockResolvedValue(null);

      await expect(service.listVersions('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns versions ordered by newest first', async () => {
      prisma.blog.findFirst.mockResolvedValue(withRelations());
      prisma.blogVersion.findMany.mockResolvedValue([{ id: 'version-1' }]);

      const result = await service.listVersions('blog-id');

      expect(prisma.blogVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blogId: 'blog-id' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'version-1' }]);
    });
  });

  describe('rollback', () => {
    it('throws NotFoundException when the version does not belong to the blog', async () => {
      prisma.blogVersion.findUnique.mockResolvedValue({
        id: 'version-1',
        blogId: 'other-blog-id',
      });

      await expect(
        service.rollback('blog-id', 'version-1', actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies the target version fields via update', async () => {
      const existing = withRelations();
      prisma.blogVersion.findUnique.mockResolvedValue({
        id: 'version-1',
        blogId: existing.id,
        title: 'Old Title',
        excerpt: 'Old excerpt',
        content: 'Old content',
      });
      prisma.blog.findFirst.mockResolvedValue(existing);
      prisma.blog.update.mockResolvedValue(
        withRelations({ title: 'Old Title' }),
      );

      await service.rollback(existing.id, 'version-1', actor);

      expect(prisma.blogVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ blogId: existing.id }),
        }),
      );
      expect(prisma.blog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Old Title',
            excerpt: 'Old excerpt',
            content: 'Old content',
          }),
        }),
      );
    });
  });
});
