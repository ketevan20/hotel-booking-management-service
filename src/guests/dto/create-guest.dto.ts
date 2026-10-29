import { Transform } from 'class-transformer';
import { IsBoolean,  IsEmail,  IsEnum,  IsOptional,  IsString,  Matches,  MaxLength,  MinLength } from 'class-validator';
import { IdType } from 'src/enums/idType.enum';

export class CreateGuestDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name!: string;

  @IsOptional()
  @Matches(/^[+\d][\d\s().-]{4,29}$/, { message: 'phone is not valid' })
  phone?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(100)
  country?: string;

  @IsOptional() @IsEnum(IdType)
  idType?: IdType;

  @IsOptional() @IsString() @MaxLength(50)
  idNumber?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  // set to true after the user confirms the "same phone already exists" warning
  @IsOptional() @IsBoolean()
  allowDuplicate?: boolean;
}