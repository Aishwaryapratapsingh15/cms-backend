import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { Permissions } from './decorators/permissions.decorator';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

const JWT_SECRET = 'integration-test-secret';

const adminUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  password: 'should-never-appear',
  isActive: true,
  roleId: 'admin-role-id',
  role: { id: 'admin-role-id', name: 'ADMIN' },
};

const editorUser = {
  id: 'editor-id',
  email: 'editor@example.com',
  password: 'should-never-appear',
  isActive: true,
  roleId: 'editor-role-id',
  role: { id: 'editor-role-id', name: 'EDITOR' },
};

@Controller('test')
class PermissionsTestController {
  @Permissions('users:read')
  @Get('users')
  readUsers() {
    return { ok: true };
  }
}

describe('Permissions (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [PermissionsTestController],
      providers: [
        JwtStrategy,
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn().mockImplementation((id: string) => {
              if (id === adminUser.id) return Promise.resolve(adminUser);
              if (id === editorUser.id) return Promise.resolve(editorUser);
              return Promise.resolve(null);
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            rolePermission: {
              findMany: jest
                .fn()
                .mockImplementation(
                  ({ where: { roleId } }: { where: { roleId: string } }) =>
                    Promise.resolve(
                      roleId === adminUser.roleId
                        ? [{ permission: { name: 'users:read' } }]
                        : [],
                    ),
                ),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(JWT_SECRET) },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects with no token', async () => {
    await request(app.getHttpServer()).get('/test/users').expect(401);
  });

  it('rejects a user whose role lacks the required permission', async () => {
    const token = await jwtService.signAsync({
      sub: editorUser.id,
      email: editorUser.email,
      role: editorUser.role.name,
    });

    await request(app.getHttpServer())
      .get('/test/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a user whose role has the required permission', async () => {
    const token = await jwtService.signAsync({
      sub: adminUser.id,
      email: adminUser.email,
      role: adminUser.role.name,
    });

    await request(app.getHttpServer())
      .get('/test/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
