import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const existingCategory = {
    id: 'category-id',
    name: 'Web Development',
    slug: 'web-development',
    description: null,
    color: null,
  };

  beforeEach(async () => {
    prisma = {
      category: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateCategoryDto = { name: 'Web Development' };

    it('auto-generates a slug from the name when omitted', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(existingCategory);

      await service.create(dto);

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'web-development' }),
        }),
      );
    });

    it('de-duplicates the auto-generated slug when it is already taken', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: 'other-id' }) // web-development taken
        .mockResolvedValueOnce(null); // web-development-2 free
      prisma.category.create.mockResolvedValue(existingCategory);

      await service.create(dto);

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'web-development-2' }),
        }),
      );
    });

    it('throws ConflictException when an explicit slug is already taken', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'other-id' });

      await expect(
        service.create({ ...dto, slug: 'web-development' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('paginates and applies a search filter', async () => {
      prisma.category.findMany.mockResolvedValue([existingCategory]);
      prisma.category.count.mockResolvedValue(1);

      const query: ListCategoriesQueryDto = {
        page: 1,
        limit: 10,
        search: 'web',
        sortBy: 'name',
        sortOrder: 'asc',
      };
      const result = await service.findAll(query);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: 'web', mode: 'insensitive' } },
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
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('leaves the slug unchanged when not provided in the update', async () => {
      prisma.category.findUnique.mockResolvedValue(existingCategory);
      prisma.category.update.mockResolvedValue(existingCategory);

      await service.update(existingCategory.id, { name: 'New Name' });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: existingCategory.id },
        data: { name: 'New Name' },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('translates a foreign-key violation into ConflictException', async () => {
      prisma.category.findUnique.mockResolvedValue(existingCategory);
      prisma.category.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK violation', {
          code: 'P2003',
          clientVersion: '6.19.0',
        }),
      );

      await expect(service.remove(existingCategory.id)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes the category when nothing references it', async () => {
      prisma.category.findUnique.mockResolvedValue(existingCategory);
      prisma.category.delete.mockResolvedValue(existingCategory);

      await service.remove(existingCategory.id);

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: existingCategory.id },
      });
    });
  });
});
