import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogService } from './audit-log.service';

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let reflector: { get: jest.Mock };
  let auditLogService: { record: jest.Mock };

  const buildContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const buildHandler = (result: unknown): CallHandler => ({
    handle: () => of(result),
  });

  const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    reflector = { get: jest.fn() };
    auditLogService = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditLogInterceptor(
      reflector as unknown as Reflector,
      auditLogService as unknown as AuditLogService,
    );
  });

  it('does not record anything when there is no @Audit() metadata', async () => {
    reflector.get.mockReturnValue(undefined);
    const request = { method: 'POST', body: {}, params: {}, user: undefined };

    await firstValueFrom(
      interceptor.intercept(buildContext(request), buildHandler({ id: 'x' })),
    );
    await flush();

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('infers CREATE from POST', async () => {
    reflector.get.mockReturnValue({ entity: 'Category' });
    const request = {
      method: 'POST',
      body: { name: 'Tech' },
      params: {},
      user: { id: 'actor-id' },
      ip: '1.2.3.4',
    };

    await firstValueFrom(
      interceptor.intercept(buildContext(request), buildHandler({ id: 'cat-id' })),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith({
      userId: 'actor-id',
      action: 'CREATE',
      entity: 'Category',
      entityId: 'cat-id',
      ipAddress: '1.2.3.4',
    });
  });

  it('infers UPDATE from PATCH', async () => {
    reflector.get.mockReturnValue({ entity: 'Tag' });
    const request = {
      method: 'PATCH',
      body: { name: 'New' },
      params: { id: 'tag-id' },
      user: { id: 'actor-id' },
    };

    await firstValueFrom(
      interceptor.intercept(buildContext(request), buildHandler({ id: 'tag-id' })),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entity: 'Tag', entityId: 'tag-id' }),
    );
  });

  it('uses the :id route param for DELETE, since delete handlers return {}', async () => {
    reflector.get.mockReturnValue({ entity: 'Tag' });
    const request = {
      method: 'DELETE',
      body: {},
      params: { id: 'tag-id' },
      user: { id: 'actor-id' },
    };

    await firstValueFrom(interceptor.intercept(buildContext(request), buildHandler({})));
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityId: 'tag-id' }),
    );
  });

  it('uses the static LOGIN override and derives userId/entityId from the response user', async () => {
    reflector.get.mockReturnValue({ entity: 'User', action: 'LOGIN' });
    const request = { method: 'POST', body: {}, params: {}, user: undefined };

    await firstValueFrom(
      interceptor.intercept(
        buildContext(request),
        buildHandler({ accessToken: 'jwt', user: { id: 'logged-in-user-id' } }),
      ),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        entity: 'User',
        entityId: 'logged-in-user-id',
        userId: 'logged-in-user-id',
      }),
    );
  });

  it('falls back to the response id as the actor for the bootstrap create (no req.user)', async () => {
    reflector.get.mockReturnValue({ entity: 'User' });
    const request = { method: 'POST', body: {}, params: {}, user: undefined };

    await firstValueFrom(
      interceptor.intercept(buildContext(request), buildHandler({ id: 'new-user-id' })),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'new-user-id', entityId: 'new-user-id' }),
    );
  });

  it('logs PUBLISH when a Blog PATCH results in status PUBLISHED', async () => {
    reflector.get.mockReturnValue({ entity: 'Blog' });
    const request = {
      method: 'PATCH',
      body: { status: 'PUBLISHED' },
      params: { id: 'blog-id' },
      user: { id: 'actor-id' },
    };

    await firstValueFrom(
      interceptor.intercept(
        buildContext(request),
        buildHandler({ id: 'blog-id', status: 'PUBLISHED' }),
      ),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PUBLISH', entity: 'Blog' }),
    );
  });

  it('logs UNPUBLISH when a Blog PATCH results in a non-PUBLISHED status', async () => {
    reflector.get.mockReturnValue({ entity: 'Blog' });
    const request = {
      method: 'PATCH',
      body: { status: 'DRAFT' },
      params: { id: 'blog-id' },
      user: { id: 'actor-id' },
    };

    await firstValueFrom(
      interceptor.intercept(
        buildContext(request),
        buildHandler({ id: 'blog-id', status: 'DRAFT' }),
      ),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UNPUBLISH', entity: 'Blog' }),
    );
  });

  it('treats a Blog PATCH with no status field in the body as a normal UPDATE', async () => {
    reflector.get.mockReturnValue({ entity: 'Blog' });
    const request = {
      method: 'PATCH',
      body: { isFeatured: true },
      params: { id: 'blog-id' },
      user: { id: 'actor-id' },
    };

    await firstValueFrom(
      interceptor.intercept(
        buildContext(request),
        buildHandler({ id: 'blog-id', status: 'DRAFT' }),
      ),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entity: 'Blog' }),
    );
  });

  it('works whether the handler result is enveloped or raw', async () => {
    reflector.get.mockReturnValue({ entity: 'Category' });
    const request = { method: 'POST', body: {}, params: {}, user: { id: 'actor-id' } };

    await firstValueFrom(
      interceptor.intercept(
        buildContext(request),
        buildHandler({
          success: true,
          message: 'Category created successfully',
          data: { id: 'cat-id' },
        }),
      ),
    );
    await flush();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'cat-id' }),
    );
  });
});
