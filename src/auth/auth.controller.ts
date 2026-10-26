import { Body, Controller, Post, Res } from "@nestjs/common";
import { SignUpDto } from "./DTO/sign-up.dto";
import { SignInDto } from "./DTO/sign-in.dto";
import { AuthService } from "./auth.service";
import type { Response } from "express";

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('sign-up')
    signUp(@Body() body: SignUpDto) {
        return this.authService.signUp(body)
    }

    @Post('sign-in')
    async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) res: Response ) {
        const accessToken = await this.authService.SingIn(dto);

        res.cookie('access_token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return { message: 'Signed in' };
    }
}