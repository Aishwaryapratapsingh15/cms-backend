import { ApiPropertyOptional } from '@nestjs/swagger';
import { BlogStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const BLOG_SORT_FIELDS = [
  'title',
  'createdAt',
  'publishedAt',
  'views',
] as const;
export type BlogSortField = (typeof BLOG_SORT_FIELDS)[number];

export class ListBlogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive match on title/excerpt/content',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BlogStatus })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: BLOG_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(BLOG_SORT_FIELDS)
  sortBy: BlogSortField = 'createdAt';
}
