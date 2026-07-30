import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Public()
  @Post('subscribe')
  @ResponseMessage('Subscribed successfully')
  @ApiOperation({ summary: 'Publicly subscribe an email to the newsletter' })
  @ApiResponse({ status: 201, description: 'Subscribed (or already was).' })
  @ApiResponse({ status: 400, description: 'Invalid email.' })
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletterService.subscribe(dto);
  }
}
