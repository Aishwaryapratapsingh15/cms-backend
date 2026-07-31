import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserByAdminDto } from './dto/create-user-by-admin.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import { domainAcceptsMail } from '../common/utils/email-domain.util';

const ADMIN_ROLE_NAME = 'ADMIN';

const SAFE_USER_SELECT = {
  id: true,
  roleId: true,
  fullName: true,
  email: true,
  designation: true,
  shortBio: true,
  linkedin: true,
  twitter: true,
  avatarMediaId: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  role: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });
  }

  async create(dto: CreateUserDto) {
    const existingUsersCount = await this.prisma.user.count();
    if (existingUsersCount > 0) {
      throw new ForbiddenException(
        'Bootstrap user creation is only allowed when no users exist yet.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already in use.');
    }

    if (!(await domainAcceptsMail(dto.email))) {
      throw new BadRequestException(
        "This email's domain doesn't appear to accept mail — check for typos.",
      );
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { name: ADMIN_ROLE_NAME },
    });
    if (!adminRole) {
      throw new InternalServerErrorException(
        'ADMIN role is not seeded. Run the seed script before creating users.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        roleId: adminRole.id,
      },
    });

    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async createByAdmin(dto: CreateUserByAdminDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already in use.');
    }

    if (!(await domainAcceptsMail(dto.email))) {
      throw new BadRequestException(
        "This email's domain doesn't appear to accept mail — check for typos.",
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        roleId: dto.roleId,
      },
      select: SAFE_USER_SELECT,
    });
  }

  async findAll(query: ListUsersQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total, firstAdmin] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.findFirst({
        where: { role: { name: ADMIN_ROLE_NAME }, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        isFirstAdmin: item.id === firstAdmin?.id,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: SAFE_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken) {
        throw new ConflictException('Email already in use.');
      }
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) {
        throw new NotFoundException('Role not found.');
      }
    }

    const { password, ...rest } = dto;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(password && { password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) }),
      },
      select: SAFE_USER_SELECT,
    });
  }

  async remove(id: string, currentUserId: string): Promise<void> {
    if (id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    const firstAdmin = await this.prisma.user.findFirst({
      where: { role: { name: ADMIN_ROLE_NAME }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (firstAdmin?.id === id) {
      throw new ForbiddenException('The first admin account cannot be deleted.');
    }

    // `email` is a hard unique constraint in the DB, and this is a soft
    // delete — the row stays forever, so without mangling the email here,
    // that address would be permanently unable to sign up again.
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        email: `deleted-${Date.now()}-${existing.email}`,
      },
    });
  }
}
