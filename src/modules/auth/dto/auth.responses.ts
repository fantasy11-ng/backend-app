import { ApiProperty } from '@nestjs/swagger';

class AuthUserResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class SignInResponse {
  @ApiProperty({ type: AuthUserResponse })
  user!: AuthUserResponse;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}

export class AccessTokenResponse {
  @ApiProperty()
  accessToken!: string;
}

export class MessageResponse {
  @ApiProperty()
  message!: string;
}
