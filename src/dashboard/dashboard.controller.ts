import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Permissions('dashboard:read')
  @ResponseMessage('Dashboard stats fetched successfully')
  @ApiOperation({ summary: 'Get aggregate stats for the admin dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard stats.' })
  getStats() {
    return this.dashboardService.getStats();
  }
}
