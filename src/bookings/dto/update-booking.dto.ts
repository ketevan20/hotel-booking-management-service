import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, ValidateNested,} from 'class-validator';
import { BookingRoomInputDto, DinnerPeriodInputDto } from './create-booking.dto';
import { BookingSource } from 'src/enums/bookings.enum';

export class UpdateBookingDto {
  @IsOptional() @IsMongoId()
  guestId?: string; // switch the booking to another existing guest

  @IsOptional() @IsInt() @Min(1)
  totalGuests?: number;

  // The full list of rooms after the change (rooms left out are removed)
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BookingRoomInputDto)
  rooms?: BookingRoomInputDto[];

  // The full list of dinner periods after the change ([] removes dinner)
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DinnerPeriodInputDto)
  dinner?: DinnerPeriodInputDto[];

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @IsOptional() @IsEnum(BookingSource)
  source?: BookingSource;
}