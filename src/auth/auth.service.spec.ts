import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; findById: jest.Mock };
  let prisma: {
    user: { update: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock };

  const dto: LoginDto = {
    email: 'jane@example.com',
    password: 'StrongPassword123',
  };

  const baseUser = {
    id: 'user-id',
    email: dto.email,
    password: 'hashed-password',
    isActive: true,
    role: { id: 'role-id', name: 'ADMIN' },
  };

  const storedToken = {
    id: 'stored-token-id',
    userId: baseUser.id,
    tokenHash: 'irrelevant-in-tests',
    expiresAt: new Date(Date.now() + 60_000),
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn(), findById: jest.fn() };
    prisma = {
      user: { update: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('7d') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    jwtService.signAsync.mockResolvedValue('signed-jwt');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('throws UnauthorizedException when the email is unknown', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when the account is deactivated', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        isActive: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('returns tokens and a password-stripped user on success', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.login(dto);

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role.name,
      });
      expect(result.accessToken).toBe('signed-jwt');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('role');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: baseUser.id }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: baseUser.id } }),
      );
    });
  });

  describe('refresh', () => {
    const refreshDto: RefreshTokenDto = { refreshToken: 'raw-refresh-token' };

    it('throws UnauthorizedException when the token is unknown', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deletes and rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date(Date.now() - 60_000),
      });
      prisma.refreshToken.delete.mockResolvedValue({});

      await expect(service.refresh(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: storedToken.id },
      });
    });

    it('deletes and rejects when the user is missing or inactive', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      usersService.findById.mockResolvedValue({ ...baseUser, isActive: false });
      prisma.refreshToken.delete.mockResolvedValue({});

      await expect(service.refresh(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: storedToken.id },
      });
    });

    it('rotates the token and returns a new pair on success', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      usersService.findById.mockResolvedValue(baseUser);
      prisma.refreshToken.delete.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh(refreshDto);

      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: storedToken.id },
      });
      expect(result.accessToken).toBe('signed-jwt');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(refreshDto.refreshToken);
      expect(result.user).not.toHaveProperty('password');
    });
  });

  describe('logout', () => {
    it('deletes only the matching refresh token for that user', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout(baseUser.id, 'raw-refresh-token');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: baseUser.id,
          tokenHash: expect.any(String),
        },
      });
    });

    it('is idempotent when the token does not match anything', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.logout(baseUser.id, 'unknown-token'),
      ).resolves.toBeUndefined();
    });
  });
});
