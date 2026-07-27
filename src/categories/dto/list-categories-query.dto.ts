import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const CATEGORY_SORT_FIELDS = ['name', 'createdAt'] as const;
export type CategorySortField = (typeof CATEGORY_SORT_FIELDS)[number];

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CATEGORY_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(CATEGORY_SORT_FIELDS)
  sortBy: CategorySortField = 'createdAt';
}
