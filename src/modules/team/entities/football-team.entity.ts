import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class FootballTeam {
  @PrimaryColumn()
  id: number;

  @Column()
  name: string;
  @Column()
  short: string;
  @Column()
  logo: string;
}
