import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { generateUniqueSlug, slugify } from '../common/utils/slug.util';
import { normalizeName } from '../common/utils/name.util';

const FOREIGN_KEY_CONSTRAINT_ERROR = 'P2003';
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const name = normalizeName(dto.name);
    await this.assertNameAvailable(name);
    const slug = await this.resolveSlug(name, dto.slug);

    try {
      return await this.prisma.category.create({
        data: {
          name,
          slug,
          heading: dto.heading,
          description: dto.description,
          color: dto.color,
        },
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async findAll(query: ListCategoriesQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.category.count({ where }),
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

  async findPublicWithCounts() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            blogs: { where: { blog: { status: 'PUBLISHED', deletedAt: null } } },
          },
        },
      },
    });

    return categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        heading: category.heading,
        description: category.description,
        color: category.color,
        count: category._count.blogs,
      }))
      .filter((category) => category.count > 0);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Category not found.');
    }

    const name = dto.name !== undefined ? normalizeName(dto.name) : undefined;
    if (name !== undefined) {
      await this.assertNameAvailable(name, id);
    }

    const slug =
      dto.slug !== undefined
        ? await this.resolveSlug(name ?? existing.name, dto.slug, id)
        : undefined;

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...dto,
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
        },
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  // Moves every blog from `sourceId` onto `targetId`, then deletes the source.
  // Blogs already carrying both categories simply end up with the target once.
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a category into itself.');
    }

    const [source, target] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: sourceId } }),
      this.prisma.category.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) {
      throw new NotFoundException('Category not found.');
    }
    if (!target) {
      throw new NotFoundException('Target category not found.');
    }

    const movedBlogs = await this.prisma.$transaction(async (tx) => {
      const links = await tx.blogCategory.findMany({
        where: { categoryId: sourceId },
        select: { blogId: true },
      });

      if (links.length > 0) {
        await tx.blogCategory.createMany({
          data: links.map(({ blogId }) => ({ blogId, categoryId: targetId })),
          skipDuplicates: true,
        });
      }
      await tx.blogCategory.deleteMany({ where: { categoryId: sourceId } });
      await tx.category.delete({ where: { id: sourceId } });

      return links.length;
    });

    return { ...target, movedBlogs };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Category not found.');
    }

    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_CONSTRAINT_ERROR
      ) {
        throw new ConflictException(
          'Cannot delete a category that is still assigned to blogs.',
        );
      }
      throw error;
    }
  }

  // Same comparison as the `lower(name)` unique index, so this check and the
  // index can never disagree. The index is what closes the concurrent-create
  // race; this check just gives a friendly error in the normal case.
  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "categories"
      WHERE lower("name") = lower(${name})
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
      LIMIT 1`;

    if (clash.length > 0) {
      throw new ConflictException('Category already exists.');
    }
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_ERROR
    ) {
      const target = JSON.stringify(error.meta?.target ?? '');
      throw new ConflictException(
        target.includes('slug')
          ? 'Slug already in use.'
          : 'Category already exists.',
      );
    }
    throw error;
  }

  private async resolveSlug(
    name: string,
    explicitSlug?: string,
    excludeId?: string,
  ): Promise<string> {
    const isTaken = async (candidate: string) => {
      const found = await this.prisma.category.findUnique({
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

    return generateUniqueSlug(name, isTaken);
  }
}
