import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { imageSize } from 'image-size';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { buildMediaUrl, MEDIA_KEY_PREFIX } from '../common/utils/media-url.util';

const FOREIGN_KEY_CONSTRAINT_ERROR = 'P2003';

const MEDIA_INCLUDE = {
  uploadedBy: {
    select: { id: true, fullName: true, email: true },
  },
} satisfies Prisma.MediaInclude;

type MediaWithRelations = Prisma.MediaGetPayload<{ include: typeof MEDIA_INCLUDE }>;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  // Constructed lazily (see getS3Client()) rather than here: NestJS instantiates
  // every provider eagerly at bootstrap, and building the AWS client in the
  // constructor would make the *entire app* refuse to start whenever AWS config
  // is missing/incomplete, not just the media endpoints that actually need it.
  private s3ClientInstance?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getS3Client(): S3Client {
    if (!this.s3ClientInstance) {
      this.s3ClientInstance = new S3Client({
        region: this.configService.getOrThrow<string>('AWS_REGION'),
        credentials: {
          accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.configService.getOrThrow<string>(
            'AWS_SECRET_ACCESS_KEY',
          ),
        },
      });
    }
    return this.s3ClientInstance;
  }

  private getBucketName(): string {
    return this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
  }

  async upload(
    file: Express.Multer.File,
    dto: UploadMediaDto,
    uploadedById: string,
  ) {
    const storedName = `${randomUUID()}${extname(file.originalname)}`;
    const s3Key = `${MEDIA_KEY_PREFIX}${storedName}`;

    const { width, height } = this.extractDimensions(file);

    await this.getS3Client().send(
      new PutObjectCommand({
        Bucket: this.getBucketName(),
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const media = await this.prisma.media.create({
      data: {
        originalName: file.originalname,
        storedName,
        s3Key,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        width,
        height,
        altText: dto.altText,
        caption: dto.caption,
        uploadedById,
      },
      include: MEDIA_INCLUDE,
    });

    return this.mapMedia(media);
  }

  async findAll(query: ListMediaQueryDto) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.MediaWhereInput = {
      ...(search && {
        originalName: { contains: search, mode: 'insensitive' },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        include: MEDIA_INCLUDE,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.media.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapMedia(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
      include: MEDIA_INCLUDE,
    });

    if (!media) {
      throw new NotFoundException('Media not found.');
    }

    return this.mapMedia(media);
  }

  async update(id: string, dto: UpdateMediaDto) {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Media not found.');
    }

    const media = await this.prisma.media.update({
      where: { id },
      data: { ...dto },
      include: MEDIA_INCLUDE,
    });

    return this.mapMedia(media);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Media not found.');
    }

    try {
      await this.prisma.media.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_CONSTRAINT_ERROR
      ) {
        throw new ConflictException(
          'Cannot delete media that is still used as a blog featured image.',
        );
      }
      throw error;
    }

    try {
      await this.getS3Client().send(
        new DeleteObjectCommand({
          Bucket: this.getBucketName(),
          Key: existing.s3Key,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete S3 object ${existing.s3Key} for media ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private extractDimensions(
    file: Express.Multer.File,
  ): { width?: number; height?: number } {
    if (!file.mimetype.startsWith('image/')) {
      return {};
    }

    try {
      const { width, height } = imageSize(file.buffer);
      return { width, height };
    } catch {
      return {};
    }
  }

  private mapMedia(media: MediaWithRelations) {
    const { fileSize, ...rest } = media;
    return {
      ...rest,
      fileSize: Number(fileSize),
      url: buildMediaUrl(this.configService, media.s3Key),
    };
  }
}
