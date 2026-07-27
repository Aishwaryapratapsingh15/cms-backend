import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('users:read')
  @ResponseMessage('Roles fetched successfully')
  @ApiOperation({ summary: 'List all roles (reference data for user role assignment)' })
  @ApiResponse({ status: 200, description: 'Roles.' })
  findAll() {
    return this.rolesService.findAll();
  }
}
