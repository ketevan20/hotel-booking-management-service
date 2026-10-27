import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { ClientSession, isValidObjectId, Model, Types } from 'mongoose';

@Injectable()
export class HotelsService {
  constructor(@InjectModel(Hotel.name) private hotelModel: Model<Hotel>) { }

  async create(
    data: Partial<Hotel>,
    session?: ClientSession,
  ): Promise<HotelDocument> {
    const [hotel] = await this.hotelModel.create([data], { session });
    return hotel;
  }

  findById(id: string | Types.ObjectId) {
    return this.hotelModel.findById(id);
  }

  update(id: string | Types.ObjectId, data: UpdateHotelDto) {
    return this.hotelModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  }
}
