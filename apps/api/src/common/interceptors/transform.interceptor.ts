import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { ApiResponse } from '@veridion/shared';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful API response in the standard `{ success, data }`
 * envelope expected by the web client and the SDK (`ApiResponse<T>`).
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
      })),
    );
  }
}
