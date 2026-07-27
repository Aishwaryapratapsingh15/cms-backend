import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import type { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    categoriesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: categoriesService }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to CategoriesService.create', () => {
    const dto = { name: 'Web Development' };
    controller.create(dto);

    expect(categoriesService.create).toHaveBeenCalledWith(dto);
  });

  it('findAll delegates to CategoriesService.findAll', () => {
    const query = { page: 1, limit: 10 } as ListCategoriesQueryDto;
    controller.findAll(query);

    expect(categoriesService.findAll).toHaveBeenCalledWith(query);
  });

  it('findOne delegates to CategoriesService.findOne', () => {
    controller.findOne('category-id');

    expect(categoriesService.findOne).toHaveBeenCalledWith('category-id');
  });

  it('update delegates to CategoriesService.update', () => {
    const dto = { name: 'New Name' };
    controller.update('category-id', dto);

    expect(categoriesService.update).toHaveBeenCalledWith('category-id', dto);
  });

  it('remove delegates to CategoriesService.remove and returns {}', async () => {
    const result = await controller.remove('category-id');

    expect(categoriesService.remove).toHaveBeenCalledWith('category-id');
    expect(result).toEqual({});
  });
});
