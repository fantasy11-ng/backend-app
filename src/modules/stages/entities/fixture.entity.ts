import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Fixture {
  @PrimaryColumn()
  id: number; // external fixture id

  @Column()
  stageId: number;

  @Column({ nullable: true })
  roundId?: number;

  @Column({ nullable: true })
  groupId?: number;

  @Column({ nullable: true })
  externalSeasonId?: number;

  @Column({ nullable: true })
  gameweekId?: number;

  @Column()
  startingAt: Date;

  @Column('int', { array: true })
  participantTeamIds: number[];

  @Column({ nullable: true })
  name?: string;

  // Result data (populated from SportMonks on sync once a fixture is played).
  @Column({ nullable: true })
  stateId?: number;

  @Column({ default: false })
  finished: boolean;

  @Column({ nullable: true })
  homeTeamId?: number;

  @Column({ nullable: true })
  awayTeamId?: number;

  @Column({ nullable: true })
  homeGoals?: number;

  @Column({ nullable: true })
  awayGoals?: number;

  @Column({ nullable: true })
  winnerTeamId?: number;

  @Column({ nullable: true })
  resultInfo?: string;
}
