import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    blogCategory: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
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
      blogCategory: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));

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

    it('throws ConflictException when a name differing only by case/whitespace exists', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'other-id' }]);

      await expect(
        service.create({ ...dto, name: '  WEB DEVELOPMENT  ' }),
      ).rejects.toThrow('Category already exists.');
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('trims and collapses whitespace in the saved name', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(existingCategory);

      await service.create({ name: '  Cloud   Computing ' });

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Cloud Computing' }),
        }),
      );
    });

    it('maps a unique-index violation (race) to ConflictException', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: '6.19.0',
          meta: { target: 'categorys_name_lower_key'.replace('categorys','categories') },
        }),
      );

      await expect(service.create(dto)).rejects.toThrow('Category already exists.');
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

    it('throws ConflictException when renaming onto an existing category name', async () => {
      prisma.category.findUnique.mockResolvedValue(existingCategory);
      prisma.$queryRaw.mockResolvedValue([{ id: 'other-id' }]);

      await expect(
        service.update(existingCategory.id, { name: 'Taken' }),
      ).rejects.toThrow('Category already exists.');
      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });

  describe('merge', () => {
    const source = { ...existingCategory, id: 'source-id' };
    const target = { ...existingCategory, id: 'target-id' };

    it('rejects merging into itself', async () => {
      await expect(service.merge('same', 'same')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the source or target is missing', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(target);
      await expect(service.merge('source-id', 'target-id')).rejects.toThrow(
        NotFoundException,
      );

      prisma.category.findUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null);
      await expect(service.merge('source-id', 'target-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('moves blogs to the target without duplicates, then deletes the source', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      prisma.blogCategory.findMany.mockResolvedValue([
        { blogId: 'blog-1' },
        { blogId: 'blog-2' },
      ]);

      const result = await service.merge('source-id', 'target-id');

      expect(prisma.blogCategory.createMany).toHaveBeenCalledWith({
        data: [
          { blogId: 'blog-1', categoryId: 'target-id' },
          { blogId: 'blog-2', categoryId: 'target-id' },
        ],
        skipDuplicates: true,
      });
      expect(prisma.blogCategory.deleteMany).toHaveBeenCalledWith({
        where: { categoryId: 'source-id' },
      });
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'source-id' },
      });
      expect(result).toMatchObject({ id: 'target-id', movedBlogs: 2 });
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
