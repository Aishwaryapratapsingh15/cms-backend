import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeTagDto {
  @ApiProperty({
    description:
      'Tag that receives all blogs of the tag being merged (which is then deleted).',
  })
  @IsUUID()
  targetId: string;
}
