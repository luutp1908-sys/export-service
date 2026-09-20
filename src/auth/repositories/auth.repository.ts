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

  async findAuthUserById(id: string, email?: string): Promise<AuthUser | null> {
    if (!id) {
      return null;
    }

    return {
      id,
      email: email ?? '',
      displayName: null,
      roles: [],
      permissions: [],
    };
  }
}
