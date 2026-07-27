import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ResponseMessage('Service is healthy')
  @ApiOperation({ summary: 'Check service and database health' })
  @ApiResponse({ status: 200, description: 'Healthy.' })
  @ApiResponse({ status: 503, description: 'Database unreachable.' })
  async check() {
    try {
      return await this.healthService.check();
    } catch {
      throw new ServiceUnavailableException('Database is unreachable.');
    }
  }
}
