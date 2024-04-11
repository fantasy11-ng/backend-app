import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';

@Catch(QueryFailedError)
export class TypeORMExceptionFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Customize your response format here. For example:
    const formattedResponse = {
      success: false,
      timestamp: new Date().toISOString(),
      path: ctx.getRequest().url,
      error: {
        code: HttpStatus.BAD_REQUEST,
        message: this.formatTypeORMError(exception),
      },
    };

    response.status(HttpStatus.BAD_REQUEST).json(formattedResponse);
  }

  private formatTypeORMError(exception: QueryFailedError) {
    // Format the error details in a user-friendly manner
    // Be careful not to expose sensitive details

    // Example: Returning a custom message for duplicate values
    if ((exception.driverError as any).code === '23505') {
      return 'Duplicate entry error';
    }

    console.log(exception);

    // Generic error message for other cases
    return 'A database error occurred';
  }
}
