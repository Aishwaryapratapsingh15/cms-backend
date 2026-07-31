import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BlogFaqDto {
  @ApiProperty({ example: 'What is hospitality ERP software?', maxLength: 300 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  question: string;

  @ApiProperty({
    example:
      'Hospitality ERP software unifies front desk, billing, and operations into one platform built for hotels.',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  answer: string;
}
