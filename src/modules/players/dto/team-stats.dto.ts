import { ApiProperty } from '@nestjs/swagger';

export class TeamStatDto {
  @ApiProperty({ description: 'Sportmonks country id for the national team' })
  countryId: number;

  @ApiProperty()
  played: number;

  @ApiProperty()
  wins: number;

  @ApiProperty()
  goals: number;

  @ApiProperty()
  conceded: number;

  @ApiProperty()
  goalDifference: number;

  @ApiProperty()
  draws: number;

  @ApiProperty()
  losses: number;
}
