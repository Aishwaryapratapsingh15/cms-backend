import { ConfigService } from '@nestjs/config';

// The CloudFront distribution's origin path is set to "/media", so CloudFront
// already prepends this segment before forwarding to S3 — the public URL must
// NOT include it a second time, or CloudFront ends up requesting
// media/media/<key> from S3 (Access Denied).
export const MEDIA_KEY_PREFIX = 'media/';

export function buildMediaUrl(configService: ConfigService, s3Key: string): string {
  const cloudFrontDomain = configService.getOrThrow<string>('AWS_CLOUDFRONT_DOMAIN');
  const publicPath = s3Key.startsWith(MEDIA_KEY_PREFIX)
    ? s3Key.slice(MEDIA_KEY_PREFIX.length)
    : s3Key;
  return `https://${cloudFrontDomain}/${publicPath}`;
}
