import { ApiProperty } from '@nestjs/swagger';
import { Player } from '../entities/player.entity';

class PaginationMetaDto {
  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  itemCount: number;

  @ApiProperty()
  itemsPerPage: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  currentPage: number;
}

class PaginationLinksDto {
  @ApiProperty()
  first: string;

  @ApiProperty({ nullable: true })
  previous?: string | null;

  @ApiProperty({ nullable: true })
  next?: string | null;

  @ApiProperty()
  last: string;
}

export class PlayerPaginatedResponseDto {
  @ApiProperty({ type: Player, isArray: true })
  data: Player[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({ type: PaginationLinksDto })
  links: PaginationLinksDto;
}


