import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PostsService } from './posts.service';

@UseGuards(RolesGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.postsService.findAll(tenantId);
  }
}
