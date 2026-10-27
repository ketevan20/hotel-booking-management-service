import { PartialType } from '@nestjs/mapped-types';
import { CreateRoomNightDto } from './create-room-night.dto';

export class UpdateRoomNightDto extends PartialType(CreateRoomNightDto) {}
