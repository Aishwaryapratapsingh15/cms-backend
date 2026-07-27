import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: '1465ba7d40ba4038947b6265286ee562a5a612232d3b6a710a0588224bdefa7db33f14cf24dd83d37d98afa025bd98189931d86e322930821ad1a613feb7f39a' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
