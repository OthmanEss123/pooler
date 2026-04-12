import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class MembershipsService {
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
  }

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
    const normalizedEmail = dto.email.trim().toLowerCase();
    const role = dto.role ?? UserRole.MEMBER;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Organisation introuvable');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      const existing = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });

      if (existing) {
        throw new ConflictException(
          `${normalizedEmail} est deja membre de cette organisation`,
        );
      }

      return this.prisma.membership.create({
        data: {
          tenantId,
          userId: user.id,
          role,
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

    const pendingInvitation = await this.prisma.invitationToken.findFirst({
      where: {
        tenantId,
        email: normalizedEmail,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingInvitation) {
      return {
        invited: true,
        pending: true,
        email: normalizedEmail,
        role: pendingInvitation.role,
        expiresAt: pendingInvitation.expiresAt,
        inviteUrl: `${this.frontendUrl}/accept-invite?token=${pendingInvitation.token}`,
      };
    }

    const invitation = await this.prisma.invitationToken.create({
      data: {
        tenantId,
        email: normalizedEmail,
        role,
        token: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      invited: true,
      pending: true,
      email: normalizedEmail,
      role,
      expiresAt: invitation.expiresAt,
      inviteUrl: `${this.frontendUrl}/accept-invite?token=${invitation.token}`,
    };
  }

  async listInvitations(tenantId: string) {
    return this.prisma.invitationToken.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(tenantId: string, invitationId: string) {
    const invitation = await this.prisma.invitationToken.findFirst({
      where: {
        id: invitationId,
        tenantId,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation introuvable');
    }

    if (invitation.usedAt) {
      throw new BadRequestException('Invitation deja utilisee');
    }

    await this.prisma.invitationToken.delete({
      where: { id: invitation.id },
    });

    return { revoked: true, id: invitation.id };
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
