import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Fixture {
  @PrimaryColumn()
  id: number; // external fixture id

  @Column()
  stageId: number;

  @Column({ nullable: true })
  groupId?: number;

  @Column({ nullable: true })
  externalSeasonId?: number;

  @Column()
  startingAt: Date;

  @Column('int', { array: true })
  participantTeamIds: number[];
}
