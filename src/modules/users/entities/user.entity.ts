import { Prediction } from '@/modules/predictor/entities/prediction.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  EDITOR = 'editor',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  fullName!: string;

  @Column({ default: '' })
  phone!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: '' })
  password?: string;

  @Column({ default: '' })
  googleId?: string;

  @Column({ default: '' })
  facebookId?: string;

  @Column({ default: '' })
  refreshToken?: string;

  @OneToMany(() => Prediction, (predtion) => predtion.owner)
  predictions?: Prediction[];
}
