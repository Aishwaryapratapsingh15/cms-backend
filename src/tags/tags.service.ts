import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import { generateUniqueSlug, slugify } from '../common/utils/slug.util';

const FOREIGN_KEY_CONSTRAINT_ERROR = 'P2003';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTagDto) {
    const slug = await this.resolveSlug(dto.name, dto.slug);

    return this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
      },
    });
  }

  async findAll(query: ListTagsQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TagWhereInput = {
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.tag.count({ where }),
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

  async findOne(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });

    if (!tag) {
      throw new NotFoundException('Tag not found.');
    }

    return tag;
  }

  async update(id: string, dto: UpdateTagDto) {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tag not found.');
    }

    const slug =
      dto.slug !== undefined
        ? await this.resolveSlug(dto.name ?? existing.name, dto.slug, id)
        : undefined;

    return this.prisma.tag.update({
      where: { id },
      data: { ...dto, ...(slug !== undefined && { slug }) },
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tag not found.');
    }

    try {
      await this.prisma.tag.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_CONSTRAINT_ERROR
      ) {
        throw new ConflictException(
          'Cannot delete a tag that is still assigned to blogs.',
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
      const found = await this.prisma.tag.findUnique({
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
