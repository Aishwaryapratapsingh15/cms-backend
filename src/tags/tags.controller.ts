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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Audit } from '../audit/decorators/audit.decorator';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @Permissions('tags:create')
  @Audit('Tag')
  @ResponseMessage('Tag created successfully')
  @ApiOperation({ summary: 'Create a tag' })
  @ApiResponse({ status: 201, description: 'Tag created.' })
  @ApiResponse({ status: 409, description: 'Slug already in use.' })
  create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto);
  }

  @Get()
  @Permissions('tags:read')
  @ResponseMessage('Tags fetched successfully')
  @ApiOperation({ summary: 'List tags with pagination, search, and sorting' })
  @ApiResponse({ status: 200, description: 'Paginated tags.' })
  findAll(@Query() query: ListTagsQueryDto) {
    return this.tagsService.findAll(query);
  }

  @Get(':id')
  @Permissions('tags:read')
  @ResponseMessage('Tag fetched successfully')
  @ApiOperation({ summary: 'Get a single tag by id' })
  @ApiResponse({ status: 200, description: 'Tag.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tagsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('tags:update')
  @Audit('Tag')
  @ResponseMessage('Tag updated successfully')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, description: 'Updated tag.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  @ApiResponse({ status: 409, description: 'Slug already in use.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('tags:delete')
  @Audit('Tag')
  @ResponseMessage('Tag deleted successfully')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 200, description: 'Tag deleted.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  @ApiResponse({ status: 409, description: 'Tag is still assigned to blogs.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tagsService.remove(id);
    return {};
  }
}
