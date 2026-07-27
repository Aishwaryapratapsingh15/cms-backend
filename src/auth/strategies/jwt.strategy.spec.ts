import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: { findById: jest.Mock };

  const payload: JwtPayload = {
    sub: 'user-id',
    email: 'jane@example.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    usersService = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('throws UnauthorizedException when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the user is deactivated', async () => {
    usersService.findById.mockResolvedValue({
      id: payload.sub,
      email: payload.email,
      password: 'hashed',
      isActive: false,
      role: { id: 'role-id', name: 'ADMIN' },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns the sanitized user for a valid, active user', async () => {
    usersService.findById.mockResolvedValue({
      id: payload.sub,
      email: payload.email,
      password: 'hashed',
      isActive: true,
      role: { id: 'role-id', name: 'ADMIN' },
    });

    const result = await strategy.validate(payload);

    expect(result).not.toHaveProperty('password');
    expect(result.id).toBe(payload.sub);
  });
});
