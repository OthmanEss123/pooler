import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(tenantId: string, dto: InviteMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException(
        `Aucun compte trouve pour ${dto.email}. L'utilisateur doit d'abord s'inscrire.`,
      );
    }

    const existing = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });

    if (existing) {
      throw new ConflictException(
        `${dto.email} est deja membre de cette organisation`,
      );
    }

    return this.prisma.membership.create({
      data: {
        tenantId,
        userId: user.id,
        role: dto.role ?? UserRole.MEMBER,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async updateRole(
    tenantId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
    currentUserId: string,
  ) {
    if (userId === currentUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre role',
      );
    }

    const membership = await this.findMembership(tenantId, userId);

    if (membership.role === UserRole.OWNER) {
      throw new ForbiddenException('Le role OWNER ne peut pas etre modifie');
    }

    return this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async remove(tenantId: string, userId: string, currentUserId: string) {
    if (userId === currentUserId) {
      throw new ForbiddenException('Vous ne pouvez pas vous retirer vous-meme');
    }

    const membership = await this.findMembership(tenantId, userId);

    if (membership.role === UserRole.OWNER) {
      throw new BadRequestException('Impossible de retirer le proprietaire');
    }

    await this.prisma.membership.delete({
      where: { id: membership.id },
    });

    return { removed: true, userId };
  }

  private async findMembership(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!membership) {
      throw new NotFoundException(
        `Membre ${userId} introuvable dans cette organisation`,
      );
    }

    return membership;
  }
}
