import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserByAdminDto } from './dto/create-user-by-admin.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { domainAcceptsMail } from '../common/utils/email-domain.util';

jest.mock('../common/utils/email-domain.util');
const mockDomainAcceptsMail = domainAcceptsMail as jest.Mock;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      count: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: {
      findUnique: jest.Mock;
    };
  };

  const dto: CreateUserDto = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'StrongPassword123',
  };

  const existingUser = {
    id: 'user-id',
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    roleId: 'role-id',
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    mockDomainAcceptsMail.mockReset().mockResolvedValue(true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('excludes soft-deleted users so their credentials stop working', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.findByEmail('jane@example.com');

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'jane@example.com', deletedAt: null },
        }),
      );
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('excludes soft-deleted users so their sessions stop working', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.findById('user-id');

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-id', deletedAt: null },
        }),
      );
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('throws ForbiddenException when users already exist', async () => {
      prisma.user.count.mockResolvedValue(1);

      await expect(service.create(dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when the email is already in use', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('throws InternalServerErrorException when the ADMIN role is not seeded', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("throws BadRequestException when the email's domain can't receive mail", async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      mockDomainAcceptsMail.mockResolvedValue(false);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the user with the ADMIN role and strips the password', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'admin-role-id', name: 'ADMIN' });
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        fullName: dto.fullName,
        email: dto.email,
        password: 'hashed-password',
        roleId: 'admin-role-id',
      });

      const result = await service.create(dto);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: dto.fullName,
            email: dto.email,
            roleId: 'admin-role-id',
          }),
        }),
      );
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('createByAdmin', () => {
    const adminDto: CreateUserByAdminDto = {
      fullName: 'John Editor',
      email: 'john@example.com',
      password: 'StrongPassword123',
      roleId: 'editor-role-id',
    };

    it('throws ConflictException when the email is already in use', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.createByAdmin(adminDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.createByAdmin(adminDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws BadRequestException when the email's domain can't receive mail", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      mockDomainAcceptsMail.mockResolvedValue(false);

      await expect(service.createByAdmin(adminDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the user with the given role, never fetching the password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({
        id: 'editor-role-id',
        name: 'EDITOR',
      });
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        fullName: adminDto.fullName,
        email: adminDto.email,
        roleId: 'editor-role-id',
      });

      const result = await service.createByAdmin(adminDto);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: adminDto.fullName,
            email: adminDto.email,
            roleId: 'editor-role-id',
          }),
          select: expect.not.objectContaining({ password: true }),
        }),
      );
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('findAll', () => {
    const query: ListUsersQueryDto = {
      page: 2,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    it('paginates and excludes soft-deleted users', async () => {
      prisma.user.findMany.mockResolvedValue([existingUser]);
      prisma.user.count.mockResolvedValue(15);

      const result = await service.findAll(query);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
          skip: 10,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.meta).toEqual({
        total: 15,
        page: 2,
        limit: 10,
        totalPages: 2,
      });
    });

    it('applies a case-insensitive search filter on fullName/email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ ...query, page: 1, search: 'jane' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { fullName: { contains: 'jane', mode: 'insensitive' } },
              { email: { contains: 'jane', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the user does not exist or is soft-deleted', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the user when found', async () => {
      prisma.user.findFirst.mockResolvedValue(existingUser);

      await expect(service.findOne(existingUser.id)).resolves.toEqual(
        existingUser,
      );
    });
  });

  describe('update', () => {
    const dto2: UpdateUserDto = { fullName: 'Jane Updated' };

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.update('missing-id', dto2)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the new email is already taken', async () => {
      prisma.user.findFirst.mockResolvedValue(existingUser);
      prisma.user.findUnique.mockResolvedValue({ id: 'someone-else' });

      await expect(
        service.update(existingUser.id, { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when the new roleId does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(existingUser);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.update(existingUser.id, { roleId: 'missing-role' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the user when valid', async () => {
      prisma.user.findFirst.mockResolvedValue(existingUser);
      prisma.user.update.mockResolvedValue({ ...existingUser, ...dto2 });

      const result = await service.update(existingUser.id, dto2);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingUser.id },
          data: { ...dto2 },
        }),
      );
      expect(result.fullName).toBe('Jane Updated');
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException when deleting your own account', async () => {
      await expect(
        service.remove(existingUser.id, existingUser.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('missing-id', 'current-user-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the user by setting deletedAt', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({ id: 'some-other-admin-id' });
      prisma.user.update.mockResolvedValue({});

      await service.remove(existingUser.id, 'current-user-id');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws ForbiddenException when deleting the first admin, even for another admin', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({ id: existingUser.id });

      await expect(
        service.remove(existingUser.id, 'current-user-id'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
