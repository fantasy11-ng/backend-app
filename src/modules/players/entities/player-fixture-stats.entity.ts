import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Player } from './player.entity';

/**
 * Per-player, per-fixture stats snapshot.
 * This is used to make player stat aggregation idempotent even if fixture scoring is rerun.
 */
@Entity()
@Index(['playerId', 'fixtureId'], { unique: true })
export class PlayerFixtureStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Player, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playerId' })
  player: Player;

  @Column({ type: 'int' })
  playerId: number;

  @Column({ type: 'int' })
  fixtureId: number;

  @Column({ type: 'int', default: 0 })
  minutesPlayed: number;

  @Column({ type: 'int', default: 0 })
  goals: number;

  @Column({ type: 'int', default: 0 })
  assists: number;

  @Column({ type: 'int', default: 0 })
  yellowCards: number;

  @Column({ type: 'int', default: 0 })
  redCards: number;

  @Column({ type: 'int', default: 0 })
  fantasyPoints: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
