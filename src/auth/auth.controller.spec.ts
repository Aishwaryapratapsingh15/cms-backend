import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; refresh: jest.Mock; logout: jest.Mock };

  const user = { id: 'user-id', email: 'jane@example.com' } as AuthenticatedUser;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('me', () => {
    it('returns the current user injected by the guard/strategy', () => {
      expect(controller.me(user)).toBe(user);
    });
  });

  describe('refresh', () => {
    it('delegates to AuthService.refresh', () => {
      const dto = { refreshToken: 'raw-token' };
      controller.refresh(dto);

      expect(authService.refresh).toHaveBeenCalledWith(dto);
    });
  });

  describe('logout', () => {
    it('delegates to AuthService.logout with the current user id', async () => {
      const dto = { refreshToken: 'raw-token' };

      const result = await controller.logout(user, dto);

      expect(authService.logout).toHaveBeenCalledWith(user.id, dto.refreshToken);
      expect(result).toEqual({});
    });
  });
});
