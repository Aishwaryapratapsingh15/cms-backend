import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const TAG_SORT_FIELDS = ['name', 'createdAt'] as const;
export type TagSortField = (typeof TAG_SORT_FIELDS)[number];

export class ListTagsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TAG_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(TAG_SORT_FIELDS)
  sortBy: TagSortField = 'createdAt';
}
