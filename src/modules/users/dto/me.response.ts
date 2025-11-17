import { ApiProperty } from '@nestjs/swagger';

export class MeResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ required: false })
  profileImageUrl?: string;
}
