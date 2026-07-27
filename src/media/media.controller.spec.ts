import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { ListMediaQueryDto } from './dto/list-media-query.dto';

describe('MediaController', () => {
  let controller: MediaController;
  let mediaService: {
    upload: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const currentUser = { id: 'user-id' } as AuthenticatedUser;
  const file = {
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('bytes'),
  } as Express.Multer.File;

  beforeEach(async () => {
    mediaService = {
      upload: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('upload delegates to MediaService.upload with the current user id', () => {
    const dto = { altText: 'Alt text' };
    controller.upload(file, dto, currentUser);

    expect(mediaService.upload).toHaveBeenCalledWith(file, dto, currentUser.id);
  });

  it('upload throws BadRequestException when no file is provided', () => {
    expect(() =>
      controller.upload(undefined as never, {}, currentUser),
    ).toThrow(BadRequestException);
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('findAll delegates to MediaService.findAll', () => {
    const query = { page: 1, limit: 10 } as ListMediaQueryDto;
    controller.findAll(query);

    expect(mediaService.findAll).toHaveBeenCalledWith(query);
  });

  it('findOne delegates to MediaService.findOne', () => {
    controller.findOne('media-id');

    expect(mediaService.findOne).toHaveBeenCalledWith('media-id');
  });

  it('update delegates to MediaService.update', () => {
    const dto = { caption: 'New caption' };
    controller.update('media-id', dto);

    expect(mediaService.update).toHaveBeenCalledWith('media-id', dto);
  });

  it('remove delegates to MediaService.remove and returns {}', async () => {
    const result = await controller.remove('media-id');

    expect(mediaService.remove).toHaveBeenCalledWith('media-id');
    expect(result).toEqual({});
  });
});
