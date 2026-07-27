import { Test, TestingModule } from '@nestjs/testing';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import type { ListTagsQueryDto } from './dto/list-tags-query.dto';

describe('TagsController', () => {
  let controller: TagsController;
  let tagsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    tagsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [{ provide: TagsService, useValue: tagsService }],
    }).compile();

    controller = module.get<TagsController>(TagsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to TagsService.create', () => {
    const dto = { name: 'NestJS' };
    controller.create(dto);

    expect(tagsService.create).toHaveBeenCalledWith(dto);
  });

  it('findAll delegates to TagsService.findAll', () => {
    const query = { page: 1, limit: 10 } as ListTagsQueryDto;
    controller.findAll(query);

    expect(tagsService.findAll).toHaveBeenCalledWith(query);
  });

  it('findOne delegates to TagsService.findOne', () => {
    controller.findOne('tag-id');

    expect(tagsService.findOne).toHaveBeenCalledWith('tag-id');
  });

  it('update delegates to TagsService.update', () => {
    const dto = { name: 'New Name' };
    controller.update('tag-id', dto);

    expect(tagsService.update).toHaveBeenCalledWith('tag-id', dto);
  });

  it('remove delegates to TagsService.remove and returns {}', async () => {
    const result = await controller.remove('tag-id');

    expect(tagsService.remove).toHaveBeenCalledWith('tag-id');
    expect(result).toEqual({});
  });
});
