import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { UsersModule } from "src/users/users.module";
import { HotelsModule } from "src/hotels/hotels.module";

@Module({
    imports: [
        ConfigModule.forRoot(),
        JwtModule.register({
            global: true,
            secret: process.env.JWT_SECRET
        }),
        UsersModule,
        HotelsModule
    ],
    controllers: [AuthController],
    providers: [AuthService]
})

export class AuthModule { }