import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(['externalId'], { unique: true })
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
  @Column()
  commonName: string;
  @Column()
  image: string;

  @Column()
  pool: string;

  @Column()
  positionId: number;
  @Column('jsonb')
  position: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
  };
  @Column()
  countryId: number;

  @Column({ nullable: true })
  externalId?: number;

  @Column({ default: 45 })
  rating: number;

  // Season-to-date (or accumulated) player stats (updated as fixtures are scored)
  @Column({ type: 'int', default: 0 })
  goals: number;

  @Column({ type: 'int', default: 0 })
  assists: number;

  @Column({ type: 'int', default: 0 })
  yellowCards: number;

  @Column({ type: 'int', default: 0 })
  redCards: number;

  @Column({ default: 0 })
  points: number;

  @Column({ type: 'int', nullable: true })
  minutesPlayed?: number | null;

  @Column({ type: 'int', nullable: true })
  appearances?: number | null;

  @Column({ type: 'int', nullable: true })
  lineups?: number | null;

  @Column({ type: 'int', nullable: true })
  starts?: number | null;

  @Column({ type: 'int', nullable: true })
  bench?: number | null;

  @Column({ type: 'int', nullable: true })
  shotsOnTarget?: number | null;

  @Column({ type: 'int', nullable: true })
  keyPasses?: number | null;

  // Transfer market price (e.g. in smallest currency unit)
  @Column({ type: 'int', default: 0 })
  price: number;

  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
