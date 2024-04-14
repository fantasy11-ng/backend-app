import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Stage {
  @PrimaryColumn()
  id: number;

  @Column()
  name: string;
  @Column()
  code: string;
  @Column()
  externalLeagueId: number;
  @Column()
  externalSeasonId: number;
  @Column()
  finished: boolean;

  @Column()
  startingAt: Date;
  @Column()
  endingAt: Date;
}
