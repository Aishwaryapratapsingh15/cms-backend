import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Audit } from '../audit/decorators/audit.decorator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @Permissions('media:create')
  @Audit('Media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}.`,
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        altText: { type: 'string' },
        caption: { type: 'string' },
      },
    },
  })
  @ResponseMessage('Media uploaded successfully')
  @ApiOperation({ summary: 'Upload a media file to S3' })
  @ApiResponse({ status: 201, description: 'Media uploaded.' })
  @ApiResponse({ status: 400, description: 'Unsupported file type or too large.' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    return this.mediaService.upload(file, dto, user.id);
  }

  @Get()
  @Permissions('media:read')
  @ResponseMessage('Media fetched successfully')
  @ApiOperation({ summary: 'List media with pagination, search, and sorting' })
  @ApiResponse({ status: 200, description: 'Paginated media.' })
  findAll(@Query() query: ListMediaQueryDto) {
    return this.mediaService.findAll(query);
  }

  @Get(':id')
  @Permissions('media:read')
  @ResponseMessage('Media fetched successfully')
  @ApiOperation({ summary: 'Get a single media record by id' })
  @ApiResponse({ status: 200, description: 'Media.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.findOne(id);
  }

  @Patch(':id')
  @Permissions('media:update')
  @Audit('Media')
  @ResponseMessage('Media updated successfully')
  @ApiOperation({ summary: 'Update media altText/caption' })
  @ApiResponse({ status: 200, description: 'Updated media.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto) {
    return this.mediaService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('media:delete')
  @Audit('Media')
  @ResponseMessage('Media deleted successfully')
  @ApiOperation({ summary: 'Delete a media record and its S3 object' })
  @ApiResponse({ status: 200, description: 'Media deleted.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  @ApiResponse({
    status: 409,
    description: 'Media is still used as a blog featured image.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.mediaService.remove(id);
    return {};
  }
}
