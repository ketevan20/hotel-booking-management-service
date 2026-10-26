import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { SignUpDto } from "./DTO/sign-up.dto";
import { SignInDto } from "./DTO/sign-in.dto";
import { AuthService } from "./auth.service";
import type { Response } from "express";
import { AuthGuard } from "./guards/auth.guard";
import type { AuthenticatedRequest, AuthUser } from './guards/auth.guard'
import { CurrentUser } from "src/decorators/current-user.decorator";
import { Roles } from "src/decorators/roles.decorator";
import { RolesGuard } from "./guards/roles.guard";
import { Role } from "src/enums/role.enum";

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('sign-up')
    signUp(@Body() body: SignUpDto) {
        return this.authService.signUp(body)
    }

    @Post('sign-in')
    async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) res: Response) {
        const accessToken = await this.authService.SingIn(dto);

        res.cookie('access_token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return { message: 'Signed in' };
    }

    @UseGuards(AuthGuard)
    @Get('me')
    me(@CurrentUser() user: AuthUser) {
        return user;
    }

    @Post('sign-out')
    signOut(@Res({ passthrough: true }) res: Response) {
        res.clearCookie('access_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });
        return { message: 'Signed out' };
    }

    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.Admin)
    @Get('admin-check')
    adminCheck() {
        return { ok: true };
    }
}