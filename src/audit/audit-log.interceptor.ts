import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { AUDIT_KEY, AuditMetadata } from './decorators/audit.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const HTTP_METHOD_ACTIONS: Record<string, string | undefined> = {
  POST: 'CREATE',
  PATCH: 'UPDATE',
  PUT: 'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap((result: unknown) => {
        void this.recordAudit(meta, request, result);
      }),
    );
  }

  private async recordAudit(
    meta: AuditMetadata,
    request: Request,
    result: unknown,
  ): Promise<void> {
    const action = this.resolveAction(meta, request, result);
    if (!action) {
      return;
    }

    const payload = this.unwrapEnvelope(result) as Record<string, unknown> | undefined;
    const params = request.params as Record<string, string> | undefined;

    const authUser = request.user as AuthenticatedUser | undefined;
    const loginActorId =
      action === 'LOGIN'
        ? ((payload?.user as Record<string, unknown> | undefined)?.id as
            | string
            | undefined)
        : undefined;

    const entityId =
      (payload?.id as string | undefined) ?? params?.id ?? loginActorId;

    const userId = authUser?.id ?? loginActorId ?? entityId;

    await this.auditLogService.record({
      userId,
      action,
      entity: meta.entity,
      entityId,
      ipAddress: request.ip ?? request.socket?.remoteAddress,
    });
  }

  private resolveAction(
    meta: AuditMetadata,
    request: Request,
    result: unknown,
  ): string | undefined {
    if (meta.action) {
      return meta.action;
    }

    const method = request.method.toUpperCase();

    if (meta.entity === 'Blog' && method === 'PATCH') {
      const body = request.body as Record<string, unknown> | undefined;
      if (body && body.status !== undefined) {
        const payload = this.unwrapEnvelope(result) as
          | Record<string, unknown>
          | undefined;
        return payload?.status === 'PUBLISHED' ? 'PUBLISH' : 'UNPUBLISH';
      }
    }

    return HTTP_METHOD_ACTIONS[method];
  }

  private unwrapEnvelope(result: unknown): unknown {
    if (
      result &&
      typeof result === 'object' &&
      'success' in result &&
      'data' in (result as Record<string, unknown>)
    ) {
      return (result as unknown as { data: unknown }).data;
    }
    return result;
  }
}
