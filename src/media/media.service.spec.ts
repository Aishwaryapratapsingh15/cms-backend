import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { imageSize } from 'image-size';
import {
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('image-size', () => ({
  imageSize: jest.fn(),
}));

describe('MediaService', () => {
  let service: MediaService;
  let prisma: {
    media: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const configValues: Record<string, string> = {
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    AWS_S3_BUCKET_NAME: 'test-bucket',
    AWS_CLOUDFRONT_DOMAIN: 'cdn.example.com',
  };

  const existingMedia = {
    id: 'media-id',
    originalName: 'photo.jpg',
    storedName: 'uuid-value.jpg',
    s3Key: 'media/uuid-value.jpg',
    mimeType: 'image/jpeg',
    fileSize: BigInt(2048),
    width: 800,
    height: 600,
    altText: null,
    caption: null,
    uploadedById: 'user-id',
    uploadedBy: { id: 'user-id', fullName: 'Jane Doe', email: 'jane@example.com' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      media: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn((key: string) => configValues[key]) },
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    const dto: UploadMediaDto = {};
    const file = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: 2048,
      buffer: Buffer.from('fake-image-bytes'),
    } as Express.Multer.File;

    it('extracts width/height for image uploads', async () => {
      (imageSize as jest.Mock).mockReturnValue({ width: 800, height: 600 });
      prisma.media.create.mockResolvedValue(existingMedia);

      await service.upload(file, dto, 'user-id');

      expect(imageSize).toHaveBeenCalledWith(file.buffer);
      expect(prisma.media.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ width: 800, height: 600 }),
        }),
      );
    });

    it('skips dimension extraction for non-image uploads', async () => {
      const pdfFile = { ...file, mimetype: 'application/pdf' } as Express.Multer.File;
      prisma.media.create.mockResolvedValue(existingMedia);

      await service.upload(pdfFile, dto, 'user-id');

      expect(imageSize).not.toHaveBeenCalled();
      expect(prisma.media.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ width: undefined, height: undefined }),
        }),
      );
    });

    it('generates a storedName that preserves the file extension', async () => {
      (imageSize as jest.Mock).mockReturnValue({ width: 800, height: 600 });
      prisma.media.create.mockResolvedValue(existingMedia);

      await service.upload(file, dto, 'user-id');

      const createData = prisma.media.create.mock.calls[0][0].data;
      expect(createData.storedName).toMatch(/\.jpg$/);
      expect(createData.s3Key).toBe(`media/${createData.storedName}`);
    });

    it('uploads to S3 with the correct bucket/key/content-type', async () => {
      (imageSize as jest.Mock).mockReturnValue({ width: 800, height: 600 });
      prisma.media.create.mockResolvedValue(existingMedia);

      await service.upload(file, dto, 'user-id');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Body: file.buffer,
          ContentType: 'image/jpeg',
        }),
      );
      expect(mockSend).toHaveBeenCalled();
    });

    it('converts fileSize to Number and computes the CloudFront url', async () => {
      (imageSize as jest.Mock).mockReturnValue({ width: 800, height: 600 });
      prisma.media.create.mockResolvedValue(existingMedia);

      const result = await service.upload(file, dto, 'user-id');

      expect(result.fileSize).toBe(2048);
      expect(typeof result.fileSize).toBe('number');
      expect(result.url).toBe('https://cdn.example.com/uuid-value.jpg');
    });
  });

  describe('findAll', () => {
    it('paginates and applies a search filter', async () => {
      prisma.media.findMany.mockResolvedValue([existingMedia]);
      prisma.media.count.mockResolvedValue(1);

      const query: ListMediaQueryDto = {
        page: 1,
        limit: 10,
        search: 'photo',
        sortBy: 'originalName',
        sortOrder: 'asc',
      };
      const result = await service.findAll(query);

      expect(prisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { originalName: { contains: 'photo', mode: 'insensitive' } },
        }),
      );
      expect(result.items[0].fileSize).toBe(2048);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing', async () => {
      prisma.media.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the media does not exist', async () => {
      prisma.media.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { altText: 'New alt' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates altText/caption', async () => {
      prisma.media.findUnique.mockResolvedValue(existingMedia);
      prisma.media.update.mockResolvedValue({
        ...existingMedia,
        altText: 'New alt',
      });

      const result = await service.update(existingMedia.id, {
        altText: 'New alt',
      });

      expect(result.altText).toBe('New alt');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the media does not exist', async () => {
      prisma.media.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('translates a foreign-key violation into ConflictException without touching S3', async () => {
      prisma.media.findUnique.mockResolvedValue(existingMedia);
      prisma.media.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK violation', {
          code: 'P2003',
          clientVersion: '6.19.0',
        }),
      );

      await expect(service.remove(existingMedia.id)).rejects.toThrow(
        ConflictException,
      );
      expect(DeleteObjectCommand).not.toHaveBeenCalled();
    });

    it('deletes the DB row and the S3 object', async () => {
      prisma.media.findUnique.mockResolvedValue(existingMedia);
      prisma.media.delete.mockResolvedValue(existingMedia);
      mockSend.mockResolvedValue({});

      await service.remove(existingMedia.id);

      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: existingMedia.s3Key,
        }),
      );
    });

    it('does not fail the request when the S3 delete itself throws', async () => {
      prisma.media.findUnique.mockResolvedValue(existingMedia);
      prisma.media.delete.mockResolvedValue(existingMedia);
      mockSend.mockRejectedValue(new Error('network error'));

      await expect(service.remove(existingMedia.id)).resolves.toBeUndefined();
    });
  });
});
