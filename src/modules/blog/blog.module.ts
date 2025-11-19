import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { PostEntity } from './entities/post.entity';
import { Category } from './entities/category.entity';
import { Tag } from './entities/tag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PostEntity, Category, Tag])],
  providers: [BlogService],
  controllers: [BlogController],
})
export class BlogModule {}
