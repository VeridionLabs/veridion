import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { logger } from '@veridion/logger';
import type { Response } from 'express';

interface ErrorBody {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: Array<{ field?: string; message: string; code: string }>;
  timestamp: string;
}

/**
 * Normalizes all thrown HTTP exceptions into a consistent error envelope:
 * `{ success: false, statusCode, message, errors, timestamp }`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract a human-readable message from the exception.
    const rawMessage = isHttpException ? exception.getResponse() : null;
    let message: string;
    let errors: ErrorBody['errors'];

    if (typeof rawMessage === 'string') {
      message = rawMessage;
    } else if (rawMessage && typeof rawMessage === 'object') {
      const obj = rawMessage as {
        message?: string | string[];
        error?: string;
      };
      if (Array.isArray(obj.message)) {
        message = obj.message.join(', ');
        errors = obj.message.map((m) => ({ message: m, code: 'VALIDATION_ERROR' }));
      } else {
        message = obj.message ?? obj.error ?? 'Request failed';
      }
    } else {
      message = 'Internal server error';
    }

    const body: ErrorBody = {
      success: false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      logger.error({ status, message, error: exception }, 'Unhandled exception');
    }

    response.status(status).json(body);
  }
}
