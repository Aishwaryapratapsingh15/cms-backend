import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { Request } from 'express';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { UsersService } from '../users/users.service';

const JWT_SECRET = 'integration-test-secret';

const activeUser = {
  id: 'user-id',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  password: 'should-never-appear-in-response',
  isActive: true,
  role: { id: 'role-id', name: 'ADMIN' },
};

@Controller('test')
class ProtectedTestController {
  @Get('protected')
  protectedRoute(@Req() req: Request) {
    return { user: req.user };
  }

  @Public()
  @Get('public')
  publicRoute() {
    return { ok: true };
  }
}

describe('JWT auth (integration)', () => {
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
      controllers: [ProtectedTestController],
      providers: [
        JwtStrategy,
        {
          provide: UsersService,
          useValue: { findById: jest.fn().mockResolvedValue(activeUser) },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(JWT_SECRET) },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a protected route with no token', async () => {
    await request(app.getHttpServer()).get('/test/protected').expect(401);
  });

  it('rejects a protected route with a garbage token', async () => {
    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', 'Bearer garbage-token')
      .expect(401);
  });

  it('allows a @Public() route with no token', async () => {
    await request(app.getHttpServer()).get('/test/public').expect(200);
  });

  it('allows a protected route with a valid token and populates req.user without a password', async () => {
    const token = await jwtService.signAsync({
      sub: activeUser.id,
      email: activeUser.email,
      role: activeUser.role.name,
    });

    const response = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.user).not.toHaveProperty('password');
    expect(response.body.user.id).toBe(activeUser.id);
  });
});
