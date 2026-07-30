import { Test, TestingModule } from '@nestjs/testing';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';

describe('NewsletterController', () => {
  let controller: NewsletterController;
  let newsletterService: { subscribe: jest.Mock };

  beforeEach(async () => {
    newsletterService = { subscribe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewsletterController],
      providers: [{ provide: NewsletterService, useValue: newsletterService }],
    }).compile();

    controller = module.get<NewsletterController>(NewsletterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('subscribe delegates to NewsletterService.subscribe', () => {
    const dto = { email: 'jane@example.com' };
    controller.subscribe(dto);

    expect(newsletterService.subscribe).toHaveBeenCalledWith(dto);
  });
});
