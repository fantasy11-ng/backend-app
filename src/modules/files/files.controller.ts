import {
  Controller,
  Delete,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/guards/roles.decorator';
import { User, UserRole } from '@/modules/users/entities/user.entity';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  // User profile image
  @Post('profile-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload my profile image' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({
    schema: { example: { url: 'https://...', path: 'users/123/profile.jpg' } },
  })
  async uploadProfileImage(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = req.user as User;
    const ext = this.extensionFromMime(file.mimetype) || 'jpg';
    const path = `users/${user.id}/profile.${ext}`;
    return this.files.uploadBuffer(file.buffer, path, file.mimetype, true);
  }

  // Blog cover (admin)
  @Post('blog/cover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload blog cover image (admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadBlogCover(@UploadedFile() file: Express.Multer.File) {
    const ext = this.extensionFromMime(file.mimetype) || 'jpg';
    const path = `blog/covers/${randomUUID()}.${ext}`;
    return this.files.uploadBuffer(file.buffer, path, file.mimetype, true);
  }

  // Blog inline image (admin)
  @Post('blog/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload blog inline image (admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadBlogImage(@UploadedFile() file: Express.Multer.File) {
    const ext = this.extensionFromMime(file.mimetype) || 'jpg';
    const path = `blog/images/${randomUUID()}.${ext}`;
    return this.files.uploadBuffer(file.buffer, path, file.mimetype, true);
  }

  // Delete by path (admin)
  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a file by storage path (admin)' })
  @ApiQuery({ name: 'path' })
  async deleteByPath(@Query('path') path: string) {
    return this.files.deleteFile(path);
  }

  private extensionFromMime(mime: string) {
    if (!mime) return '';
    const parts = mime.split('/');
    return parts[1] || '';
  }
}
