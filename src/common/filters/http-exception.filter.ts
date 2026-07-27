import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

interface ErrorBody {
  success: false;
  message: string;
  errors: string[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.buildErrorBody(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json(body);
  }

  private buildErrorBody(exception: unknown): {
    status: number;
    body: ErrorBody;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        Array.isArray((exceptionResponse as Record<string, unknown>).message)
      ) {
        return {
          status,
          body: {
            success: false,
            message: 'Validation failed',
            errors: (exceptionResponse as Record<string, unknown>)
              .message as string[],
          },
        };
      }

      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as Record<string, unknown>)?.message as
              | string
              | undefined) ?? exception.message;

      return {
        status,
        body: {
          success: false,
          message,
          errors: [message],
        },
      };
    }

    if (exception instanceof MulterError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          success: false,
          message: exception.message,
          errors: [exception.message],
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        message: 'Internal server error',
        errors: [],
      },
    };
  }
}
