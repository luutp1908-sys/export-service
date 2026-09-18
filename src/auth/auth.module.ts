import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { ExportAuthRepository } from './repositories/auth.repository';
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret', 'change_me_access'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.accessExpiresIn', '15m'),
        },
      }),
    }),
  ],
  providers: [
    ExportAuthRepository,
    { provide: 'EXPORT_AUTH_REPOSITORY', useExisting: ExportAuthRepository },
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],})
export class ExportAuthModule {}
