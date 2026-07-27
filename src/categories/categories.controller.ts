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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Audit } from '../audit/decorators/audit.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Permissions('categories:create')
  @Audit('Category')
  @ResponseMessage('Category created successfully')
  @ApiOperation({ summary: 'Create a category' })
  @ApiResponse({ status: 201, description: 'Category created.' })
  @ApiResponse({ status: 409, description: 'Slug already in use.' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  @Permissions('categories:read')
  @ResponseMessage('Categories fetched successfully')
  @ApiOperation({ summary: 'List categories with pagination, search, and sorting' })
  @ApiResponse({ status: 200, description: 'Paginated categories.' })
  findAll(@Query() query: ListCategoriesQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Public()
  @Get('public')
  @ResponseMessage('Categories fetched successfully')
  @ApiOperation({ summary: 'Publicly list categories that have at least one published blog, with counts' })
  @ApiResponse({ status: 200, description: 'Categories with published blog counts.' })
  findPublicWithCounts() {
    return this.categoriesService.findPublicWithCounts();
  }

  @Get(':id')
  @Permissions('categories:read')
  @ResponseMessage('Category fetched successfully')
  @ApiOperation({ summary: 'Get a single category by id' })
  @ApiResponse({ status: 200, description: 'Category.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('categories:update')
  @Audit('Category')
  @ResponseMessage('Category updated successfully')
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({ status: 200, description: 'Updated category.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Slug already in use.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('categories:delete')
  @Audit('Category')
  @ResponseMessage('Category deleted successfully')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiResponse({ status: 200, description: 'Category deleted.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({
    status: 409,
    description: 'Category is still assigned to blogs.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.categoriesService.remove(id);
    return {};
  }
}
