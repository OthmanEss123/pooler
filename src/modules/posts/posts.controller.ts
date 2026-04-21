import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { QueryPostsDto } from './dto/query-posts.dto';
import { PostsService } from './posts.service';

@UseGuards(RolesGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() query: QueryPostsDto) {
    return this.postsService.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.postsService.findOne(tenantId, id);
  }
}
