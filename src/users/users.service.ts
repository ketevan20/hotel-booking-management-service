import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { ClientSession, Model } from 'mongoose';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>,) { }

  static normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async create( data: Partial<User>, session?: ClientSession ): Promise<UserDocument> {
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
  findByIdInHotel(id: string, hotelId: string) {
    return this.userModel.findOne({ _id: id, hotelId });
  }

  findAllInHotel(hotelId: string) {
    return this.userModel.find({ hotelId }).sort({ createdAt: 1 });
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }
}
