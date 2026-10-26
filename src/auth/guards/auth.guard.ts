import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { HotelsService } from '../../hotels/hotels.service';
import { Role } from '../../enums/role.enum';
import { HotelStatus } from 'src/enums/hotelStatus.enum';

export interface AuthUser {
    id: string;
    hotelId: string;
    role: Role;
    isOwner: boolean;
}
export type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly usersService: UsersService,
        private readonly hotelsService: HotelsService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const token = request.cookies?.['access_token'];
        if (!token) throw new UnauthorizedException();

        let payload: { sub: string };
        try {
            payload = await this.jwtService.verifyAsync(token);
        } catch {
            throw new UnauthorizedException();
        }

        const user = await this.usersService.findById(payload.sub);
        if (!user || !user.isActive) throw new UnauthorizedException();

        const hotel = await this.hotelsService.findById(user.hotelId);
        if (!hotel || hotel.status !== HotelStatus.Active) {
            throw new UnauthorizedException();
        }

        request.user = {
            id: user.id,
            hotelId: user.hotelId.toString(),
            role: user.role,
            isOwner: user.isOwner,
        };
        return true;
    }
}