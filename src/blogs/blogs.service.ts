import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { ListBlogsQueryDto } from './dto/list-blogs-query.dto';
import { generateUniqueSlug, slugify } from '../common/utils/slug.util';
import { stripMarkdown, truncate } from '../common/utils/text.util';
import { buildMediaUrl } from '../common/utils/media-url.util';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const MANAGE_ALL_BLOGS_PERMISSION = 'blogs:manage-all';
const PUBLISH_BLOGS_PERMISSION = 'blogs:publish';

const WORDS_PER_MINUTE = 200;
const SEO_TITLE_MAX_LENGTH = 60;
const SEO_DESCRIPTION_MAX_LENGTH = 160;

const BLOG_INCLUDE = {
  author: {
    select: { id: true, fullName: true, email: true, avatarMediaId: true },
  },
  featuredMedia: {
    select: { id: true, s3Key: true, altText: true, width: true, height: true },
  },
  categories: { include: { category: true } },
  tags: { include: { tag: true } },
  faqs: { orderBy: { position: 'asc' } },
} satisfies Prisma.BlogInclude;

type BlogWithRelations = Prisma.BlogGetPayload<{ include: typeof BLOG_INCLUDE }>;

interface StatusFields {
  status: BlogStatus;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
  archivedAt?: Date | null;
}

function calculateReadingTime(content: string): number {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

@Injectable()
export class BlogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateBlogDto, actor: AuthenticatedUser) {
    if (dto.status && dto.status !== BlogStatus.DRAFT) {
      await this.assertCanPublish(actor.roleId);
    }

    const slug = await this.resolveSlug(dto.title, dto.slug);

    if (dto.categoryIds?.length) {
      await this.validateIdsExist('category', dto.categoryIds);
    }
    if (dto.tagIds?.length) {
      await this.validateIdsExist('tag', dto.tagIds);
    }
    if (dto.featuredMediaId) {
      await this.validateMediaExists(dto.featuredMediaId);
    }

    const content = dto.content ?? '';

    const statusFields = this.resolveStatusFields(
      dto.status ?? BlogStatus.DRAFT,
      dto.scheduledAt,
      { status: BlogStatus.DRAFT, publishedAt: null },
      content,
    );

    const seoFields = this.resolveSeoFields(dto, slug, content);

    const blog = await this.prisma.blog.create({
      data: {
        authorId: actor.id,
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        content,
        readingTime: calculateReadingTime(content),
        ...seoFields,
        ctaHeading: dto.ctaHeading,
        ctaDescription: dto.ctaDescription,
        ctaPrimaryText: dto.ctaPrimaryText,
        ctaPrimaryUrl: dto.ctaPrimaryUrl,
        ctaSecondaryText: dto.ctaSecondaryText,
        ctaSecondaryUrl: dto.ctaSecondaryUrl,
        isFeatured: dto.isFeatured,
        allowComments: dto.allowComments,
        featuredMediaId: dto.featuredMediaId,
        ...statusFields,
        categories: dto.categoryIds?.length
          ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
        tags: dto.tagIds?.length
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
        faqs: dto.faqs?.length
          ? {
              create: dto.faqs.map((faq, index) => ({
                question: faq.question,
                answer: faq.answer,
                position: index,
              })),
            }
          : undefined,
      },
      include: BLOG_INCLUDE,
    });

    return this.mapBlog(blog);
  }

  async findAll(query: ListBlogsQueryDto) {
    const { page, limit, search, status, category, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BlogWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(category && { categories: { some: { category: { slug: category } } } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { excerpt: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        include: BLOG_INCLUDE,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.blog.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapBlog(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublished(query: ListBlogsQueryDto) {
    return this.findAll({ ...query, status: BlogStatus.PUBLISHED });
  }

  // Called on a timer (see BlogsSchedulerService) rather than at read-time,
  // so a SCHEDULED post actually flips to PUBLISHED on its own instead of
  // needing someone to manually reopen and re-save it.
  async publishDueScheduledBlogs() {
    const due = await this.prisma.blog.findMany({
      where: {
        status: BlogStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
        deletedAt: null,
      },
      select: { id: true, slug: true, scheduledAt: true },
    });

    return Promise.all(
      due.map((blog) =>
        this.prisma.blog.update({
          where: { id: blog.id },
          data: {
            status: BlogStatus.PUBLISHED,
            publishedAt: blog.scheduledAt,
            scheduledAt: null,
          },
          select: { id: true, slug: true },
        }),
      ),
    );
  }

  async findOne(id: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { id, deletedAt: null },
      include: BLOG_INCLUDE,
    });

    if (!blog) {
      throw new NotFoundException('Blog not found.');
    }

    return this.mapBlog(blog);
  }

  async findBySlug(slug: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { slug, deletedAt: null, status: BlogStatus.PUBLISHED },
      include: BLOG_INCLUDE,
    });

    if (!blog) {
      throw new NotFoundException('Blog not found.');
    }

    await this.prisma.blog.update({
      where: { id: blog.id },
      data: { views: { increment: 1 } },
    });

    return this.mapBlog({ ...blog, views: blog.views + 1 });
  }

  async update(id: string, dto: UpdateBlogDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.blog.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Blog not found.');
    }

    if (existing.authorId !== actor.id) {
      await this.assertCanManageAllBlogs(actor.roleId);
    }

    if (dto.status && dto.status !== BlogStatus.DRAFT) {
      await this.assertCanPublish(actor.roleId);
    }

    const editedById = actor.id;

    const slug =
      dto.slug !== undefined
        ? await this.resolveSlug(dto.title ?? existing.title, dto.slug, id)
        : undefined;

    if (dto.categoryIds) {
      await this.validateIdsExist('category', dto.categoryIds);
    }
    if (dto.tagIds) {
      await this.validateIdsExist('tag', dto.tagIds);
    }
    if (dto.featuredMediaId) {
      await this.validateMediaExists(dto.featuredMediaId);
    }

    const statusFields = dto.status
      ? this.resolveStatusFields(
          dto.status,
          dto.scheduledAt,
          existing,
          dto.content ?? existing.content,
        )
      : undefined;

    const contentChanged =
      (dto.title !== undefined && dto.title !== existing.title) ||
      (dto.excerpt !== undefined && dto.excerpt !== existing.excerpt) ||
      (dto.content !== undefined && dto.content !== existing.content);

    const readingTime =
      dto.content !== undefined ? calculateReadingTime(dto.content) : undefined;

    const blog = await this.prisma.$transaction(async (tx) => {
      if (contentChanged) {
        await tx.blogVersion.create({
          data: {
            blogId: id,
            editedById,
            title: existing.title,
            excerpt: existing.excerpt,
            content: existing.content,
          },
        });
      }

      if (dto.categoryIds) {
        await tx.blogCategory.deleteMany({ where: { blogId: id } });
        if (dto.categoryIds.length) {
          await tx.blogCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({ blogId: id, categoryId })),
          });
        }
      }

      if (dto.tagIds) {
        await tx.blogTag.deleteMany({ where: { blogId: id } });
        if (dto.tagIds.length) {
          await tx.blogTag.createMany({
            data: dto.tagIds.map((tagId) => ({ blogId: id, tagId })),
          });
        }
      }

      if (dto.faqs) {
        await tx.blogFaq.deleteMany({ where: { blogId: id } });
        if (dto.faqs.length) {
          await tx.blogFaq.createMany({
            data: dto.faqs.map((faq, index) => ({
              blogId: id,
              question: faq.question,
              answer: faq.answer,
              position: index,
            })),
          });
        }
      }

      return tx.blog.update({
        where: { id },
        data: {
          title: dto.title,
          slug,
          excerpt: dto.excerpt,
          content: dto.content,
          readingTime,
          seoTitle: dto.seoTitle,
          seoDescription: dto.seoDescription,
          canonicalUrl: dto.canonicalUrl,
          ctaHeading: dto.ctaHeading,
          ctaDescription: dto.ctaDescription,
          ctaPrimaryText: dto.ctaPrimaryText,
          ctaPrimaryUrl: dto.ctaPrimaryUrl,
          ctaSecondaryText: dto.ctaSecondaryText,
          ctaSecondaryUrl: dto.ctaSecondaryUrl,
          isFeatured: dto.isFeatured,
          allowComments: dto.allowComments,
          featuredMediaId: dto.featuredMediaId,
          ...statusFields,
        },
        include: BLOG_INCLUDE,
      });
    });

    return this.mapBlog(blog);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.blog.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Blog not found.');
    }

    // `slug` is a hard unique constraint in the DB, and this is a soft
    // delete — the row stays forever, so without mangling the slug here,
    // it would be permanently unusable for a new post.
    await this.prisma.blog.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `deleted-${Date.now()}-${existing.slug}`,
      },
    });
  }

  async listVersions(id: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { id, deletedAt: null },
    });
    if (!blog) {
      throw new NotFoundException('Blog not found.');
    }

    return this.prisma.blogVersion.findMany({
      where: { blogId: id },
      include: {
        editedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rollback(id: string, versionId: string, actor: AuthenticatedUser) {
    const version = await this.prisma.blogVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.blogId !== id) {
      throw new NotFoundException('Version not found for this blog.');
    }

    return this.update(
      id,
      {
        title: version.title,
        excerpt: version.excerpt ?? undefined,
        content: version.content,
      },
      actor,
    );
  }

  private mapBlog(blog: BlogWithRelations) {
    return {
      ...blog,
      featuredMedia: blog.featuredMedia
        ? { ...blog.featuredMedia, url: buildMediaUrl(this.configService, blog.featuredMedia.s3Key) }
        : null,
      categories: blog.categories.map((entry) => entry.category),
      tags: blog.tags.map((entry) => entry.tag),
    };
  }

  private resolveStatusFields(
    status: BlogStatus,
    scheduledAt: string | undefined,
    current: { status: BlogStatus; publishedAt: Date | null },
    content: string,
  ): StatusFields {
    const fields: StatusFields = { status };

    if (
      (status === BlogStatus.PUBLISHED || status === BlogStatus.SCHEDULED) &&
      !content.trim()
    ) {
      throw new BadRequestException(
        'Content is required to publish or schedule a post.',
      );
    }

    if (status === BlogStatus.SCHEDULED) {
      if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
        throw new BadRequestException(
          'scheduledAt must be a future date when status is SCHEDULED.',
        );
      }
      fields.scheduledAt = new Date(scheduledAt);
      fields.publishedAt = null;
    } else if (current.status === BlogStatus.SCHEDULED) {
      fields.scheduledAt = null;
    }

    if (status === BlogStatus.ARCHIVED) {
      fields.archivedAt = new Date();
    } else if (current.status === BlogStatus.ARCHIVED) {
      fields.archivedAt = null;
    }

    if (status === BlogStatus.PUBLISHED) {
      fields.publishedAt = current.publishedAt ?? new Date();
    }

    return fields;
  }

  private resolveSeoFields(
    dto: CreateBlogDto,
    slug: string,
    content: string,
  ): {
    seoTitle?: string;
    seoDescription?: string;
    canonicalUrl?: string;
  } {
    const seoTitle =
      dto.seoTitle !== undefined
        ? dto.seoTitle
        : truncate(dto.title, SEO_TITLE_MAX_LENGTH);

    const seoDescription =
      dto.seoDescription !== undefined
        ? dto.seoDescription
        : truncate(
            dto.excerpt?.trim() || stripMarkdown(content),
            SEO_DESCRIPTION_MAX_LENGTH,
          );

    let canonicalUrl = dto.canonicalUrl;
    if (canonicalUrl === undefined) {
      const baseUrl = this.configService.get<string>('PUBLIC_SITE_URL');
      canonicalUrl = baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/blog/${slug}`
        : undefined;
    }

    return { seoTitle, seoDescription, canonicalUrl };
  }

  private async hasPermission(roleId: string, permission: string): Promise<boolean> {
    const grant = await this.prisma.rolePermission.findFirst({
      where: { roleId, permission: { name: permission } },
    });
    return grant !== null;
  }

  private async assertCanManageAllBlogs(roleId: string): Promise<void> {
    if (!(await this.hasPermission(roleId, MANAGE_ALL_BLOGS_PERMISSION))) {
      throw new ForbiddenException('You can only edit or delete your own blogs.');
    }
  }

  private async assertCanPublish(roleId: string): Promise<void> {
    if (!(await this.hasPermission(roleId, PUBLISH_BLOGS_PERMISSION))) {
      throw new ForbiddenException(
        'You do not have permission to publish or schedule blogs — save as a draft instead.',
      );
    }
  }

  private async validateIdsExist(
    model: 'category' | 'tag',
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const count =
      model === 'category'
        ? await this.prisma.category.count({ where: { id: { in: ids } } })
        : await this.prisma.tag.count({ where: { id: { in: ids } } });

    if (count !== ids.length) {
      throw new BadRequestException(`One or more ${model} ids are invalid.`);
    }
  }

  private async validateMediaExists(mediaId: string): Promise<void> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) {
      throw new NotFoundException('Featured media not found.');
    }
  }

  private async resolveSlug(
    title: string,
    explicitSlug?: string,
    excludeId?: string,
  ): Promise<string> {
    const isTaken = async (candidate: string) => {
      const found = await this.prisma.blog.findUnique({
        where: { slug: candidate },
      });
      return Boolean(found && found.id !== excludeId);
    };

    if (explicitSlug) {
      const normalized = slugify(explicitSlug);
      if (await isTaken(normalized)) {
        throw new ConflictException('Slug already in use.');
      }
      return normalized;
    }

    return generateUniqueSlug(title, isTaken);
  }
}
