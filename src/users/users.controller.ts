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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserByAdminDto } from './dto/create-user-by-admin.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Audit } from '../audit/decorators/audit.decorator';

const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Audit('User')
  @Post()
  @ResponseMessage('User created successfully')
  @ApiOperation({
    summary:
      'Bootstrap the first admin user. Only works while the users table is empty.',
  })
  @ApiResponse({ status: 201, description: 'User created.' })
  @ApiResponse({ status: 403, description: 'Bootstrap already completed.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('invite')
  @Permissions('users:create')
  @Audit('User')
  @ApiBearerAuth()
  @ResponseMessage('User created successfully')
  @ApiOperation({
    summary: 'Create an additional user with a chosen role (admin-only)',
  })
  @ApiResponse({ status: 201, description: 'User created.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  createByAdmin(@Body() dto: CreateUserByAdminDto) {
    return this.usersService.createByAdmin(dto);
  }

  @Get()
  @Permissions('users:read')
  @ApiBearerAuth()
  @ResponseMessage('Users fetched successfully')
  @ApiOperation({ summary: 'List users with pagination, search, and sorting' })
  @ApiResponse({ status: 200, description: 'Paginated users.' })
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Permissions('users:read')
  @ApiBearerAuth()
  @ResponseMessage('User fetched successfully')
  @ApiOperation({ summary: 'Get a single user by id' })
  @ApiResponse({ status: 200, description: 'User.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Permissions('users:update')
  @Audit('User')
  @ApiBearerAuth()
  @ResponseMessage('User updated successfully')
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({ status: 200, description: 'Updated user.' })
  @ApiResponse({ status: 404, description: 'User or role not found.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Post(':id/avatar')
  @Permissions('users:update')
  @Audit('User')
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AVATAR_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException(`Unsupported file type: ${file.mimetype}.`),
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
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ResponseMessage('Avatar updated successfully')
  @ApiOperation({
    summary: "Upload and set a user's avatar photo (admin-only)",
  })
  @ApiResponse({ status: 200, description: 'Updated user.' })
  @ApiResponse({
    status: 400,
    description: 'Unsupported file type or too large.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  setAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    return this.usersService.setAvatar(id, file, user.id);
  }

  @Delete(':id')
  @Permissions('users:delete')
  @Audit('User')
  @ApiBearerAuth()
  @ResponseMessage('User deleted successfully')
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  @ApiResponse({ status: 403, description: 'Cannot delete your own account.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.usersService.remove(id, user.id);
    return {};
  }
}
