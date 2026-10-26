import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { SignUpDto } from './DTO/sign-up.dto';
import { SignInDto } from './DTO/sign-in.dto';
import { UsersService } from '../users/users.service';
import { HotelsService } from '../hotels/hotels.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Role } from '../enums/role.enum';
import { HotelStatus } from 'src/enums/hotelStatus.enum';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
    constructor(private readonly usersService: UsersService, private readonly hotelsService: HotelsService, private readonly jwtService: JwtService, @InjectConnection() private readonly connection: Connection) { }

    async signUp(dto: SignUpDto) {
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
        const session = await this.connection.startSession();

        try {
            // All or nothing: no hotel without an owner, no owner without a hotel
            await session.withTransaction(async () => {
                const hotel = await this.hotelsService.create(
                    {
                        name: dto.hotelName,
                        country: dto.country,
                        currency: dto.currency,
                        timezone: dto.timezone,
                    },
                    session,
                );

                await this.usersService.create(
                    {
                        hotelId: hotel._id,
                        name: dto.name,
                        email: dto.email,
                        passwordHash,
                        role: Role.Admin,
                        isOwner: true,
                        emailVerified: true, // until the email service exists
                    },
                    session,
                );
            });
        } catch (err) {
            if ((err as { code?: number })?.code === 11000) {
                throw new ConflictException('This email is already registered');
            }
            throw err;
        } finally {
            await session.endSession();
        }

        return { message: 'Account created' };
    }

    async SingIn(dto: SignInDto) {
        const invalid = new UnauthorizedException('Invalid email or password');

        const user = await this.usersService.findByEmailWithSecrets(dto.email);

        if (!user) throw invalid

        const passwordOk = await bcrypt.compare(
            dto.password,
            user.passwordHash
        );

        if (!passwordOk || !user.isActive || !user.emailVerified) {
            throw invalid;
        }

        const hotel = await this.hotelsService.findById(user.hotelId);
        if (!hotel || hotel.status !== HotelStatus.Active) {
            throw invalid;
        }

        return this.jwtService.signAsync({
            sub: user.id,
            hotelId: user.hotelId.toString(),
            role: user.role,
        }, {expiresIn: '7d'});
    }
}