import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { User } from './entities/user.entity';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MeResponse } from './dto/me.response';
import { SchemaValidator } from '@/common/validators/schema.validator';
import { UpdateMeDto, updateMeDtoSchema } from './dto/update-me.dto';
import { UsersService } from './users.service';
import {
  UpdatePasswordDto,
  updatePasswordDtoSchema,
} from './dto/update-password.dto';
import { MessageResponse } from '@/modules/auth/dto/auth.responses';
import * as bcrypt from 'bcrypt';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ type: MeResponse })
  getMe(@Req() req: Request) {
    return req.user as User;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current authenticated user' })
  @ApiOkResponse({ type: MeResponse })
  async updateMe(
    @Req() req: Request,
    @Body(new SchemaValidator(updateMeDtoSchema)) dto: UpdateMeDto,
  ) {
    const authUser = req.user as User;
    await this.usersService.update(authUser.id, dto);
    const updated = await this.usersService.findOne({ id: authUser.id });
    if (!updated) return null;
    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      phone: updated.phone,
      isActive: updated.isActive,
      profileImageUrl: updated.profileImageUrl,
    } as MeResponse;
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user password' })
  @ApiOkResponse({ type: MessageResponse })
  async updateMyPassword(
    @Req() req: Request,
    @Body(new SchemaValidator(updatePasswordDtoSchema)) dto: UpdatePasswordDto,
  ) {
    const authUser = req.user as User;
    const user = await this.usersService.findOne({ id: authUser.id });
    if (!user || !user.password) {
      throw new BadRequestException('Invalid user');
    }

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.usersService.update(user.id, { password: hashed });
    return { message: 'Password updated successfully' } as MessageResponse;
  }
}
