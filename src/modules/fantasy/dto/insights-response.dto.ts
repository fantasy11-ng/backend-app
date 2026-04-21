import { ApiProperty } from '@nestjs/swagger';

export enum InsightMetricUnit {
  PERCENT = 'PERCENT',
  COUNT = 'COUNT',
  POINTS = 'POINTS',
}

export class InsightWidgetPlayerDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  commonName: string;

  @ApiProperty()
  image: string;

  @ApiProperty()
  pool: string;

  @ApiProperty()
  positionCode: string;

  @ApiProperty()
  points: number;
}

export class InsightWidgetItemDto {
  @ApiProperty({ type: InsightWidgetPlayerDto })
  player: InsightWidgetPlayerDto;

  @ApiProperty({
    description:
      'Numeric value for the card metric (use `metricUnit` for formatting).',
  })
  metricValue: number;
}

export class InsightWidgetCardDto {
  @ApiProperty()
  title: string;

  @ApiProperty({ enum: InsightMetricUnit })
  metricUnit: InsightMetricUnit;

  @ApiProperty()
  metricLabel: string;

  @ApiProperty({ type: InsightWidgetItemDto, isArray: true })
  items: InsightWidgetItemDto[];

  @ApiProperty({
    nullable: true,
    description:
      'Optional gameweek context used for gameweek-scoped cards (e.g. top performer).',
  })
  gameweekId: number | null;

  @ApiProperty({ nullable: true })
  gameweekCode: string | null;
}

export class GlobalInsightsResponseDto {
  @ApiProperty({ type: InsightWidgetCardDto })
  mostSelected: InsightWidgetCardDto;

  @ApiProperty({ type: InsightWidgetCardDto })
  mostCaptained: InsightWidgetCardDto;

  @ApiProperty({ type: InsightWidgetCardDto })
  mostTransferred: InsightWidgetCardDto;

  @ApiProperty({ type: InsightWidgetCardDto })
  bestPerforming: InsightWidgetCardDto;
}

