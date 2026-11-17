import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { NormalizeName } from '../../common/utils/name.util';

export class CreateTagDto {
  @ApiProperty({ example: 'NestJS', maxLength: 100 })
  @NormalizeName()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'URL-friendly identifier. Auto-generated from name if omitted.',
    example: 'nestjs',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;
}
