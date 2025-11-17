import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BlogService } from './blog.service';
import { SchemaValidator } from '@/common/validators/schema.validator';
import {
  CreatePostDto,
  QueryPostsDto,
  UpdatePostDto,
  createPostDtoSchema,
  queryPostsDtoSchema,
  updatePostDtoSchema,
} from './dto/post.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  createCategoryDtoSchema,
  updateCategoryDtoSchema,
} from './dto/category.dto';
import {
  CreateTagDto,
  UpdateTagDto,
  createTagDtoSchema,
  updateTagDtoSchema,
} from './dto/tag.dto';
import { Request } from 'express';
import { User, UserRole } from '@/modules/users/entities/user.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/guards/roles.decorator';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // Public
  @Get('posts')
  @ApiOperation({ summary: 'List published posts' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPosts(
    @Query(new SchemaValidator(queryPostsDtoSchema)) query: QueryPostsDto,
  ) {
    return this.blogService.listPosts(query);
  }

  @Get('posts/:slug')
  @ApiOperation({ summary: 'Get published post by slug' })
  @ApiParam({ name: 'slug' })
  getPost(@Param('slug') slug: string) {
    return this.blogService.getPostBySlug(slug);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories' })
  listCategories() {
    return this.blogService.listCategories();
  }

  @Get('tags')
  @ApiOperation({ summary: 'List tags' })
  listTags() {
    return this.blogService.listTags();
  }

  // Admin
  @Post('posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create post (admin)' })
  @ApiBody({ type: CreatePostDto })
  createPost(
    @Req() req: Request,
    @Body(new SchemaValidator(createPostDtoSchema)) dto: CreatePostDto,
  ) {
    return this.blogService.createPost(req.user as User, dto);
  }

  @Patch('posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update post (admin)' })
  updatePost(
    @Param('id') id: string,
    @Body(new SchemaValidator(updatePostDtoSchema)) dto: UpdatePostDto,
  ) {
    return this.blogService.updatePost(id, dto);
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete post (admin)' })
  deletePost(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create category (admin)' })
  createCategory(
    @Body(new SchemaValidator(createCategoryDtoSchema)) dto: CreateCategoryDto,
  ) {
    return this.blogService.createCategory(dto);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category (admin)' })
  updateCategory(
    @Param('id') id: string,
    @Body(new SchemaValidator(updateCategoryDtoSchema)) dto: UpdateCategoryDto,
  ) {
    return this.blogService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete category (admin)' })
  deleteCategory(@Param('id') id: string) {
    return this.blogService.deleteCategory(id);
  }

  @Post('tags')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create tag (admin)' })
  createTag(@Body(new SchemaValidator(createTagDtoSchema)) dto: CreateTagDto) {
    return this.blogService.createTag(dto);
  }

  @Patch('tags/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update tag (admin)' })
  updateTag(
    @Param('id') id: string,
    @Body(new SchemaValidator(updateTagDtoSchema)) dto: UpdateTagDto,
  ) {
    return this.blogService.updateTag(id, dto);
  }

  @Delete('tags/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete tag (admin)' })
  deleteTag(@Param('id') id: string) {
    return this.blogService.deleteTag(id);
  }
}
