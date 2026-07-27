import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'NestJS', maxLength: 100 })
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
