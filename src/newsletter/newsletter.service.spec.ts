import { Test, TestingModule } from '@nestjs/testing';
import { NewsletterService } from './newsletter.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NewsletterService', () => {
  let service: NewsletterService;
  let prisma: {
    newsletterSubscriber: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      newsletterSubscriber: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsletterService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<NewsletterService>(NewsletterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('subscribe', () => {
    it('creates a new subscriber with a normalized email', async () => {
      prisma.newsletterSubscriber.findUnique.mockResolvedValue(null);
      prisma.newsletterSubscriber.create.mockResolvedValue({
        id: 'sub-id',
        email: 'jane@example.com',
      });

      const result = await service.subscribe({ email: '  Jane@Example.com  ' });

      expect(prisma.newsletterSubscriber.findUnique).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
      });
      expect(prisma.newsletterSubscriber.create).toHaveBeenCalledWith({
        data: { email: 'jane@example.com' },
      });
      expect(result).toEqual({ id: 'sub-id', email: 'jane@example.com' });
    });

    it('is idempotent — returns the existing subscriber instead of erroring', async () => {
      const existing = { id: 'sub-id', email: 'jane@example.com' };
      prisma.newsletterSubscriber.findUnique.mockResolvedValue(existing);

      const result = await service.subscribe({ email: 'jane@example.com' });

      expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });
});
