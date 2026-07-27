import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Permissions('audit:read')
  @ResponseMessage('Audit logs fetched successfully')
  @ApiOperation({
    summary: 'List audit log entries, filterable by entity/action/userId',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit logs.' })
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
