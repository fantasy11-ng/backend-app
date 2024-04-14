import { z } from 'zod';

export const changePasswordDtoSchema = z
  .object({
    oldPassword: z.string(),
    newPassword: z.string(),
  })
  .refine((data) => {
    return !(data.newPassword === data.oldPassword);
  }, 'New password must not be the same as old password');

export class ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}
