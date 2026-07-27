import { Test, TestingModule } from '@nestjs/testing';
import { BlogsController } from './blogs.controller';
import { BlogsService } from './blogs.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { ListBlogsQueryDto } from './dto/list-blogs-query.dto';

describe('BlogsController', () => {
  let controller: BlogsController;
  let blogsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    findBySlug: jest.Mock;
    findPublished: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    listVersions: jest.Mock;
    rollback: jest.Mock;
  };

  const currentUser = { id: 'author-id' } as AuthenticatedUser;

  beforeEach(async () => {
    blogsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findBySlug: jest.fn(),
      findPublished: jest.fn(),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      listVersions: jest.fn(),
      rollback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlogsController],
      providers: [{ provide: BlogsService, useValue: blogsService }],
    }).compile();

    controller = module.get<BlogsController>(BlogsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to BlogsService.create with the current user', () => {
    const dto = { title: 'Title', content: 'Content' };
    controller.create(dto, currentUser);

    expect(blogsService.create).toHaveBeenCalledWith(dto, currentUser);
  });

  it('findAll delegates to BlogsService.findAll', () => {
    const query = { page: 1, limit: 10 } as ListBlogsQueryDto;
    controller.findAll(query);

    expect(blogsService.findAll).toHaveBeenCalledWith(query);
  });

  it('findBySlug delegates to BlogsService.findBySlug', () => {
    controller.findBySlug('my-slug');

    expect(blogsService.findBySlug).toHaveBeenCalledWith('my-slug');
  });

  it('findPublished delegates to BlogsService.findPublished', () => {
    const query = { page: 1, limit: 10 } as ListBlogsQueryDto;
    controller.findPublished(query);

    expect(blogsService.findPublished).toHaveBeenCalledWith(query);
  });

  it('findOne delegates to BlogsService.findOne', () => {
    controller.findOne('blog-id');

    expect(blogsService.findOne).toHaveBeenCalledWith('blog-id');
  });

  it('listVersions delegates to BlogsService.listVersions', () => {
    controller.listVersions('blog-id');

    expect(blogsService.listVersions).toHaveBeenCalledWith('blog-id');
  });

  it('rollback delegates to BlogsService.rollback with the current user', () => {
    controller.rollback('blog-id', 'version-id', currentUser);

    expect(blogsService.rollback).toHaveBeenCalledWith(
      'blog-id',
      'version-id',
      currentUser,
    );
  });

  it('update delegates to BlogsService.update with the current user', () => {
    const dto = { title: 'New Title' };
    controller.update('blog-id', dto, currentUser);

    expect(blogsService.update).toHaveBeenCalledWith('blog-id', dto, currentUser);
  });

  it('remove delegates to BlogsService.remove and returns {}', async () => {
    const result = await controller.remove('blog-id');

    expect(blogsService.remove).toHaveBeenCalledWith('blog-id');
    expect(result).toEqual({});
  });
});
