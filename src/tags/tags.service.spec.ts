import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TagsService } from './tags.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';

describe('TagsService', () => {
  let service: TagsService;
  let prisma: {
    tag: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    blogTag: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  const existingTag = {
    id: 'tag-id',
    name: 'NestJS',
    slug: 'nestjs',
  };

  beforeEach(async () => {
    prisma = {
      tag: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      blogTag: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateTagDto = { name: 'NestJS' };

    it('auto-generates a slug from the name when omitted', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue(existingTag);

      await service.create(dto);

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'nestjs' }),
        }),
      );
    });

    it('de-duplicates the auto-generated slug when it is already taken', async () => {
      prisma.tag.findUnique
        .mockResolvedValueOnce({ id: 'other-id' })
        .mockResolvedValueOnce(null);
      prisma.tag.create.mockResolvedValue(existingTag);

      await service.create(dto);

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'nestjs-2' }),
        }),
      );
    });

    it('throws ConflictException when an explicit slug is already taken', async () => {
      prisma.tag.findUnique.mockResolvedValue({ id: 'other-id' });

      await expect(
        service.create({ ...dto, slug: 'nestjs' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when a name differing only by case/whitespace exists', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'other-id' }]);

      await expect(
        service.create({ ...dto, name: '  NESTJS  ' }),
      ).rejects.toThrow('Tag already exists.');
      expect(prisma.tag.create).not.toHaveBeenCalled();
    });

    it('trims and collapses whitespace in the saved name', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue(existingTag);

      await service.create({ name: '  Cloud   Computing ' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Cloud Computing' }),
        }),
      );
    });

    it('maps a unique-index violation (race) to ConflictException', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: '6.19.0',
          meta: { target: 'tags_name_lower_key'.replace('categorys','categories') },
        }),
      );

      await expect(service.create(dto)).rejects.toThrow('Tag already exists.');
    });
  });

  describe('findAll', () => {
    it('paginates and applies a search filter', async () => {
      prisma.tag.findMany.mockResolvedValue([existingTag]);
      prisma.tag.count.mockResolvedValue(1);

      const query: ListTagsQueryDto = {
        page: 1,
        limit: 10,
        search: 'nest',
        sortBy: 'name',
        sortOrder: 'asc',
      };
      const result = await service.findAll(query);

      expect(prisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: 'nest', mode: 'insensitive' } },
          skip: 0,
          take: 10,
          orderBy: { name: 'asc' },
        }),
      );
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the tag does not exist', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('leaves the slug unchanged when not provided in the update', async () => {
      prisma.tag.findUnique.mockResolvedValue(existingTag);
      prisma.tag.update.mockResolvedValue(existingTag);

      await service.update(existingTag.id, { name: 'New Name' });

      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: existingTag.id },
        data: { name: 'New Name' },
      });
    });

    it('throws ConflictException when renaming onto an existing tag name', async () => {
      prisma.tag.findUnique.mockResolvedValue(existingTag);
      prisma.$queryRaw.mockResolvedValue([{ id: 'other-id' }]);

      await expect(
        service.update(existingTag.id, { name: 'Taken' }),
      ).rejects.toThrow('Tag already exists.');
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });

  describe('merge', () => {
    const source = { ...existingTag, id: 'source-id' };
    const target = { ...existingTag, id: 'target-id' };

    it('rejects merging into itself', async () => {
      await expect(service.merge('same', 'same')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the source or target is missing', async () => {
      prisma.tag.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(target);
      await expect(service.merge('source-id', 'target-id')).rejects.toThrow(
        NotFoundException,
      );

      prisma.tag.findUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null);
      await expect(service.merge('source-id', 'target-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('moves blogs to the target without duplicates, then deletes the source', async () => {
      prisma.tag.findUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      prisma.blogTag.findMany.mockResolvedValue([
        { blogId: 'blog-1' },
        { blogId: 'blog-2' },
      ]);

      const result = await service.merge('source-id', 'target-id');

      expect(prisma.blogTag.createMany).toHaveBeenCalledWith({
        data: [
          { blogId: 'blog-1', tagId: 'target-id' },
          { blogId: 'blog-2', tagId: 'target-id' },
        ],
        skipDuplicates: true,
      });
      expect(prisma.blogTag.deleteMany).toHaveBeenCalledWith({
        where: { tagId: 'source-id' },
      });
      expect(prisma.tag.delete).toHaveBeenCalledWith({
        where: { id: 'source-id' },
      });
      expect(result).toMatchObject({ id: 'target-id', movedBlogs: 2 });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the tag does not exist', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('translates a foreign-key violation into ConflictException', async () => {
      prisma.tag.findUnique.mockResolvedValue(existingTag);
      prisma.tag.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK violation', {
          code: 'P2003',
          clientVersion: '6.19.0',
        }),
      );

      await expect(service.remove(existingTag.id)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes the tag when nothing references it', async () => {
      prisma.tag.findUnique.mockResolvedValue(existingTag);
      prisma.tag.delete.mockResolvedValue(existingTag);

      await service.remove(existingTag.id);

      expect(prisma.tag.delete).toHaveBeenCalledWith({
        where: { id: existingTag.id },
      });
    });
  });
});
