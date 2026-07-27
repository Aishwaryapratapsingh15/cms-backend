import { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { rolePermission: { findMany: jest.Mock } };
  let guard: PermissionsGuard;

  const user = { id: 'user-id', roleId: 'role-id' } as AuthenticatedUser;

  const buildContext = (requestUser?: AuthenticatedUser): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: requestUser }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { rolePermission: { findMany: jest.fn() } };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );
  });

  it('allows the request without a DB lookup when no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when permissions are required but there is no user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read']);

    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when the role is missing a required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:delete']);
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'users:read' } },
    ]);

    await expect(guard.canActivate(buildContext(user))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the request when the role has every required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:delete']);
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'users:read' } },
      { permission: { name: 'users:delete' } },
    ]);

    await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roleId: user.roleId } }),
    );
  });
});
