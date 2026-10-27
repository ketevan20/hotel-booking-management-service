import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { ClientSession, isValidObjectId, Model, Types } from 'mongoose';
import { AuthUser } from 'src/auth/guards/auth.guard';
import { Role } from 'src/enums/role.enum';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>,) { }

  static normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async create(data: Partial<User>, session?: ClientSession): Promise<UserDocument> {
    const [user] = await this.userModel.create(
      [{ ...data, email: UsersService.normalizeEmail(data.email!) }],
      { session },
    );
    return user;
  }

  // Includes the hidden fields login needs
  findByEmailWithSecrets(email: string) {
    return this.userModel
      .findOne({ email: UsersService.normalizeEmail(email) })
      .select('+passwordHash');
  }

  // Always scoped to a hotel, so one hotel can never read another's users
  findByIdInHotel(id: string, hotelId: Types.ObjectId | string) {
    return this.userModel.findOne({
      _id: new Types.ObjectId(id),
      hotelId: new Types.ObjectId(hotelId),
    });
  }

  findAllInHotel(hotelId: Types.ObjectId | string) {
    return this.userModel
      .find({ hotelId: new Types.ObjectId(hotelId) })
      .sort({ createdAt: 1 });
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }

  async createByAdmin(actor: AuthUser, dto: CreateUserDto) {
    const role = dto.role ?? Role.Staff;
    if (role === Role.Admin && !actor.isOwner) {
      throw new ForbiddenException('Only the owner can create admins');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.create({
        hotelId: new Types.ObjectId(actor.hotelId),
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        role,
        isOwner: false,
        emailVerified: true, // until the email service exists
        createdBy: new Types.ObjectId(actor.id),
      });
      // re-read so the response never includes the password hash
      return await this.findByIdInHotel(user.id, actor.hotelId);
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictException('This email is already registered');
      }
      throw err;
    }
  }

  async setActive(actor: AuthUser, targetId: string, isActive: boolean) {
    if (!isValidObjectId(targetId)) throw new NotFoundException();

    const target = await this.findByIdInHotel(targetId, actor.hotelId);
    if (!target) throw new NotFoundException();

    if (target.id === actor.id) {
      throw new ForbiddenException('You cannot change your own status');
    }
    if (target.isOwner) {
      throw new ForbiddenException('The owner cannot be changed');
    }
    if (target.role === Role.Admin && !actor.isOwner) {
      throw new ForbiddenException('Only the owner can manage admins');
    }

    target.isActive = isActive;
    await target.save();
    return target;
  }
}
