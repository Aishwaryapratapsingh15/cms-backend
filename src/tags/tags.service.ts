import {
  BadRequestException,
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
import { normalizeName } from '../common/utils/name.util';

const FOREIGN_KEY_CONSTRAINT_ERROR = 'P2003';
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTagDto) {
    const name = normalizeName(dto.name);
    await this.assertNameAvailable(name);
    const slug = await this.resolveSlug(name, dto.slug);

    try {
      return await this.prisma.tag.create({
        data: {
          name,
          slug,
        },
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
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

    const name = dto.name !== undefined ? normalizeName(dto.name) : undefined;
    if (name !== undefined) {
      await this.assertNameAvailable(name, id);
    }

    const slug =
      dto.slug !== undefined
        ? await this.resolveSlug(name ?? existing.name, dto.slug, id)
        : undefined;

    try {
      return await this.prisma.tag.update({
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
  // Blogs already carrying both tags simply end up with the target once.
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a tag into itself.');
    }

    const [source, target] = await Promise.all([
      this.prisma.tag.findUnique({ where: { id: sourceId } }),
      this.prisma.tag.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) {
      throw new NotFoundException('Tag not found.');
    }
    if (!target) {
      throw new NotFoundException('Target tag not found.');
    }

    const movedBlogs = await this.prisma.$transaction(async (tx) => {
      const links = await tx.blogTag.findMany({
        where: { tagId: sourceId },
        select: { blogId: true },
      });

      if (links.length > 0) {
        await tx.blogTag.createMany({
          data: links.map(({ blogId }) => ({ blogId, tagId: targetId })),
          skipDuplicates: true,
        });
      }
      await tx.blogTag.deleteMany({ where: { tagId: sourceId } });
      await tx.tag.delete({ where: { id: sourceId } });

      return links.length;
    });

    return { ...target, movedBlogs };
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

  // Same comparison as the `lower(name)` unique index, so this check and the
  // index can never disagree. The index is what closes the concurrent-create
  // race; this check just gives a friendly error in the normal case.
  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "tags"
      WHERE lower("name") = lower(${name})
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
      LIMIT 1`;

    if (clash.length > 0) {
      throw new ConflictException('Tag already exists.');
    }
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_ERROR
    ) {
      const target = JSON.stringify(error.meta?.target ?? '');
      throw new ConflictException(
        target.includes('slug') ? 'Slug already in use.' : 'Tag already exists.',
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
