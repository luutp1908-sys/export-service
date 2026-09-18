import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../types/auth-user.type';

type AuthUserRoleRecord = {
  role: {
    key: string;
    rolePermissions: Array<{
      permission: {
        key: string;
      };
    }>;
  };
};

type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string;
  userRoles: AuthUserRoleRecord[];
};

@Injectable()
export class ExportAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAuthUserById(id: string): Promise<AuthUser | null> {
    const user = (await (this.prisma as any).user.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        userRoles: {
          where: {
            role: {
              deletedAt: null,
            },
          },
          select: {
            role: {
              select: {
                key: true,
                rolePermissions: {
                  where: {
                    permission: {
                      deletedAt: null,
                    },
                  },
                  select: {
                    permission: {
                      select: {
                        key: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })) as AuthUserRecord | null;

    if (!user) {
      return null;
    }

    const roles = [...new Set(user.userRoles.map((ur: AuthUserRoleRecord) => ur.role.key))] as string[];
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur: AuthUserRoleRecord) =>
          ur.role.rolePermissions.map((rp) => rp.permission.key),
        ),
      ),
    ] as string[];

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles,
      permissions,
    };
  }
}
