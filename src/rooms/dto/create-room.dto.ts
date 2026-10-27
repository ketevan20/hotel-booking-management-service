import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRoomDto {
  // accept 101 as well as "101"
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsString() @IsNotEmpty() @MaxLength(20)
  number!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  type!: string;

  @IsInt() @Min(1)
  capacity!: number;

  @IsNumber() @Min(0)
  price!: number;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
}