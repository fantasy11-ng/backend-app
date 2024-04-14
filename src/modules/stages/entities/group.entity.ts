import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Group {
  @PrimaryColumn()
  id: number;
  @Column({ default: 0 })
  externalStageId: number;

  @Column()
  name: string;
  @Column('jsonb')
  teams: {
    name: string;
    short: string;
    logo: string;
    id: number;
  }[];
}
