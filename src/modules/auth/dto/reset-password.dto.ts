import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

export const resetPasswordRequestDtoSchema = z.object({
  email: z.string().email(),
});

export class ResetPasswordRequestDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'test@example.com',
  })
  email: string;
}

export const resetPasswordDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  token: z.string(),
});

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'test@example.com',
  })
  email: string;
  @ApiProperty({
    description: 'The new password of the user',
    example: 'password',
  })
  password: string;
  @ApiProperty({
    description: 'The reset token of the user',
    example: 'token',
  })
  token: string;
}
