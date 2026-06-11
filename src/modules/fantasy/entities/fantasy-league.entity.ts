import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { FantasyLeagueMembership } from './fantasy-league-membership.entity';

@Entity()
@Index(['inviteCode'], { unique: true, where: '"inviteCode" IS NOT NULL' })
export class FantasyLeague {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: '' })
  logoUrl: string;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  inviteCode?: string | null;

  @ManyToOne(() => User, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: string;

  @OneToMany(
    () => FantasyLeagueMembership,
    (membership) => membership.league,
  )
  memberships: FantasyLeagueMembership[];

  @CreateDateColumn()
  createdAt: Date;
}


