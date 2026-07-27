import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const MEDIA_SORT_FIELDS = ['originalName', 'createdAt', 'fileSize'] as const;
export type MediaSortField = (typeof MEDIA_SORT_FIELDS)[number];

export class ListMediaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on originalName' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MEDIA_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(MEDIA_SORT_FIELDS)
  sortBy: MediaSortField = 'createdAt';
}
