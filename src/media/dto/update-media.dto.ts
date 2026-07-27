import { PartialType } from '@nestjs/swagger';
import { UploadMediaDto } from './upload-media.dto';

export class UpdateMediaDto extends PartialType(UploadMediaDto) {}
