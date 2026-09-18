import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtClaims } from './types/auth-user.type';

type ExportAuthRepositoryContract = {
  findAuthUserById(userId: string): Promise<AuthUser | null>;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject('EXPORT_AUTH_REPOSITORY') private readonly authRepository: ExportAuthRepositoryContract,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret', 'change_me_access'),
    });
  }

  async validate(payload: JwtClaims): Promise<AuthUser> {
    const user = await this.authRepository.findAuthUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid access token');
    }

    return user;
  }
}
