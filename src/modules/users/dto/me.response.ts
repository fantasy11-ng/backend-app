import { ApiProperty } from '@nestjs/swagger';

class MePredictionProgress {
  @ApiProperty()
  completed!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ description: 'Completion percentage (0–100).' })
  percent!: number;
}

class MePredictionSection {
  @ApiProperty({ example: 'group-stage' })
  key!: string;

  @ApiProperty({ example: 'Group Stage' })
  label!: string;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  total!: number;
}

export class MePredictionStatus {
  @ApiProperty({
    enum: ['not_started', 'in_progress', 'complete'],
    description: 'Overall state of the user prediction across the tournament.',
  })
  state!: 'not_started' | 'in_progress' | 'complete';

  @ApiProperty({ type: () => MePredictionProgress })
  progress!: MePredictionProgress;

  @ApiProperty({ type: () => MePredictionSection, isArray: true })
  sections!: MePredictionSection[];
}

export class MeResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ required: false })
  profileImageUrl?: string;

  @ApiProperty({
    type: () => MePredictionStatus,
    required: false,
    nullable: true,
    description:
      'Prediction completion status. Null when an active season is unavailable.',
  })
  predictionStatus?: MePredictionStatus | null;
}
