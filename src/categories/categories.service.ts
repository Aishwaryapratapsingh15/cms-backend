import {
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

const FOREIGN_KEY_CONSTRAINT_ERROR = 'P2003';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = await this.resolveSlug(dto.name, dto.slug);

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        heading: dto.heading,
        description: dto.description,
        color: dto.color,
      },
    });
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

    const slug =
      dto.slug !== undefined
        ? await this.resolveSlug(dto.name ?? existing.name, dto.slug, id)
        : undefined;

    return this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(slug !== undefined && { slug }) },
    });
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
