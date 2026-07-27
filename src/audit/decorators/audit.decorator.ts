import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  entity: string;
  action?: string;
}

export const Audit = (entity: string, action?: string) =>
  SetMetadata(AUDIT_KEY, { entity, action } satisfies AuditMetadata);
