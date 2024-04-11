import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
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

  @Column({ default: 45 })
  rating: number;
  @Column({ default: 0 })
  points: number;

  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
