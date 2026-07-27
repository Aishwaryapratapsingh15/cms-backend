import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    create: jest.Mock;
    createByAdmin: jest.Mock;
    findByEmail: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const currentUser = { id: 'current-user-id' } as AuthenticatedUser;

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      createByAdmin: jest.fn(),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createByAdmin', () => {
    it('delegates to UsersService.createByAdmin', () => {
      const dto = {
        fullName: 'John Editor',
        email: 'john@example.com',
        password: 'StrongPassword123',
        roleId: 'editor-role-id',
      };
      controller.createByAdmin(dto);

      expect(usersService.createByAdmin).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('delegates to UsersService.findAll', () => {
      const query = { page: 1, limit: 10 } as ListUsersQueryDto;
      controller.findAll(query);

      expect(usersService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('delegates to UsersService.findOne', () => {
      controller.findOne('user-id');

      expect(usersService.findOne).toHaveBeenCalledWith('user-id');
    });
  });

  describe('update', () => {
    it('delegates to UsersService.update', () => {
      const dto = { fullName: 'New Name' };
      controller.update('user-id', dto);

      expect(usersService.update).toHaveBeenCalledWith('user-id', dto);
    });
  });

  describe('remove', () => {
    it('delegates to UsersService.remove with the current user id', async () => {
      const result = await controller.remove('user-id', currentUser);

      expect(usersService.remove).toHaveBeenCalledWith(
        'user-id',
        currentUser.id,
      );
      expect(result).toEqual({});
    });
  });
});
