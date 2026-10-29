import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId, IsNumber, IsOptional, Matches, Min, ValidateNested } from 'class-validator';
import { DinnerPeriodInputDto } from './create-booking.dto';

export class ExtendRoomInputDto {
    @IsMongoId()
    roomId!: string; // a room that is already in the booking

    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'must look like 2026-11-10' })
    newCheckOut!: string;

    // when this room is taken for the extra nights, put them in another room
    @IsOptional() @IsMongoId()
    moveToRoomId?: string;

    // only for a moved room, and only an admin can use it
    @IsOptional() @IsNumber() @Min(0)
    agreedPrice?: number;
}

export class ExtendBookingDto {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ExtendRoomInputDto)
    rooms!: ExtendRoomInputDto[];

    // dinner for the added nights only
    @IsOptional() @IsArray() @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => DinnerPeriodInputDto)
    dinner?: DinnerPeriodInputDto[];
}