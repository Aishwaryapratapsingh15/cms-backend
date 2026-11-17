import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeCategoryDto {
  @ApiProperty({
    description:
      'Category that receives all blogs of the category being merged (which is then deleted).',
  })
  @IsUUID()
  targetId: string;
}
