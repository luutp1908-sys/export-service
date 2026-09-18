export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthUserWithSecrets {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  passwordHash: string;
  refreshTokenHash: string | null;
}

export interface JwtClaims {
  sub: string;
  email: string;
}