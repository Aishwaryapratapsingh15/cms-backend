import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { ListBlogsQueryDto } from './dto/list-blogs-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Audit } from '../audit/decorators/audit.decorator';

@ApiTags('blogs')
@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Post()
  @Permissions('blogs:create')
  @Audit('Blog')
  @ApiBearerAuth()
  @ResponseMessage('Blog created successfully')
  @ApiOperation({ summary: 'Create a blog post' })
  @ApiResponse({ status: 201, description: 'Blog created.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid category/tag id or scheduledAt.',
  })
  @ApiResponse({ status: 409, description: 'Slug already in use.' })
  create(@Body() dto: CreateBlogDto, @CurrentUser() user: AuthenticatedUser) {
    return this.blogsService.create(dto, user);
  }

  @Get()
  @Permissions('blogs:read')
  @ApiBearerAuth()
  @ResponseMessage('Blogs fetched successfully')
  @ApiOperation({
    summary: 'List blogs with pagination, search, status filter, and sorting',
  })
  @ApiResponse({ status: 200, description: 'Paginated blogs.' })
  findAll(@Query() query: ListBlogsQueryDto) {
    return this.blogsService.findAll(query);
  }

  @Public()
  @Get('slug/:slug')
  @ResponseMessage('Blog fetched successfully')
  @ApiOperation({ summary: 'Publicly fetch a published blog by its slug' })
  @ApiResponse({ status: 200, description: 'Published blog.' })
  @ApiResponse({ status: 404, description: 'Not found or not published.' })
  findBySlug(@Param('slug') slug: string) {
    return this.blogsService.findBySlug(slug);
  }

  @Public()
  @Get('public')
  @ResponseMessage('Published blogs fetched successfully')
  @ApiOperation({
    summary:
      'Publicly list published blogs with pagination, search, and sorting',
  })
  @ApiResponse({ status: 200, description: 'Paginated published blogs.' })
  findPublished(@Query() query: ListBlogsQueryDto) {
    return this.blogsService.findPublished(query);
  }

  @Get(':id')
  @Permissions('blogs:read')
  @ApiBearerAuth()
  @ResponseMessage('Blog fetched successfully')
  @ApiOperation({ summary: 'Get a single blog by id (any status)' })
  @ApiResponse({ status: 200, description: 'Blog.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.findOne(id);
  }

  @Get(':id/versions')
  @Permissions('blogs:read')
  @ApiBearerAuth()
  @ResponseMessage('Blog versions fetched successfully')
  @ApiOperation({ summary: 'List the edit history of a blog' })
  @ApiResponse({ status: 200, description: 'Version history.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  listVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.listVersions(id);
  }

  @Post(':id/versions/:versionId/rollback')
  @Permissions('blogs:update')
  @Audit('Blog', 'UPDATE')
  @ApiBearerAuth()
  @ResponseMessage('Blog rolled back successfully')
  @ApiOperation({
    summary: 'Restore title/excerpt/content from a previous version',
  })
  @ApiResponse({
    status: 200,
    description: 'Blog restored to the given version.',
  })
  @ApiResponse({ status: 404, description: 'Blog or version not found.' })
  rollback(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.blogsService.rollback(id, versionId, user);
  }

  @Patch(':id')
  @Permissions('blogs:update')
  @Audit('Blog')
  @ApiBearerAuth()
  @ResponseMessage('Blog updated successfully')
  @ApiOperation({ summary: 'Update a blog' })
  @ApiResponse({ status: 200, description: 'Updated blog.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid category/tag id or scheduledAt.',
  })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  @ApiResponse({ status: 409, description: 'Slug already in use.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.blogsService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('blogs:delete')
  @Audit('Blog')
  @ApiBearerAuth()
  @ResponseMessage('Blog deleted successfully')
  @ApiOperation({ summary: 'Soft-delete a blog' })
  @ApiResponse({ status: 200, description: 'Blog deleted.' })
  @ApiResponse({ status: 404, description: 'Blog not found.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.blogsService.remove(id);
    return {};
  }
}
