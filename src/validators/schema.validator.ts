import {
  BadRequestException,
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  Logger,
} from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class SchemaValidator<T> implements PipeTransform {
  private readonly logger = new Logger(SchemaValidator.name);

  constructor(private readonly zodSchema: ZodSchema<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      return this.zodSchema.parse(value);
    } catch (error: any) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));

        this.logger.error(
          `Validation failed for ${metadata.type}: ${JSON.stringify(
            formattedErrors,
          )}`,
        );
        throw new BadRequestException(
          `Validation error: ${JSON.stringify(formattedErrors)}`,
        );
      }

      // Fallback for non-Zod errors
      this.logger.error(
        `An unexpected error occurred during validation: ${error.message}`,
      );
      throw new BadRequestException(
        'An unexpected error occurred during payload validation',
      );
    }
  }
}
