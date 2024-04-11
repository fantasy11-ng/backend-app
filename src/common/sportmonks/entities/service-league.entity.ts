import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceSeason } from './service-season.entity';

@Entity()
export class ServiceLeague {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  isMain: boolean;
  @Column()
  name: string;
  @Column()
  imageUrl: string;

  @OneToOne(() => ServiceSeason, { cascade: true })
  @JoinColumn()
  currentSeason: ServiceSeason;

  @Column()
  serviceId: number;
  @Column()
  countryId: number;

  @Column()
  lastPlayedAt: Date;
  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
