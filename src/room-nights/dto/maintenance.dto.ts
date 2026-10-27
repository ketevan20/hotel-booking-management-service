import { IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class MaintenanceDto {
  @IsMongoId()
  roomId!: string;

  @Matches(DAY, { message: 'from must look like 2026-11-10' })
  from!: string; // first blocked night

  @Matches(DAY, { message: 'to must look like 2026-11-13' })
  to!: string; // not blocked: the room is free again on this day

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}