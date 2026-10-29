import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { DepositInputDto } from './create-booking.dto';
import { IdType } from 'src/enums/idType.enum';

export class CheckInDto {
  @IsOptional() @IsEnum(IdType)
  idType?: IdType;

  @IsOptional() @IsString() @MaxLength(50)
  idNumber?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DepositInputDto)
  deposit?: DepositInputDto;
}