import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
    };

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
