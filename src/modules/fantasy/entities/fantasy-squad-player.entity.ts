import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Player } from '@/modules/players/entities/player.entity';
import { FantasySquad } from './fantasy-squad.entity';
import { PositionCode } from '@/modules/fantasy/fantasy.types';

@Entity()
@Index(['squadId', 'playerId'], { unique: true })
export class FantasySquadPlayer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasySquad, (squad) => squad.players, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'squadId' })
  squad: FantasySquad;

  @Column()
  squadId: string;

  @ManyToOne(() => Player, { eager: true })
  @JoinColumn({ name: 'playerId' })
  player: Player;

  @Column()
  playerId: number;

  @Column({ type: 'varchar' })
  position: PositionCode;

  @Column({ default: false })
  isStarting: boolean;

  @Column({ default: false })
  isCaptain: boolean;

  @Column({ default: false })
  isViceCaptain: boolean;

  @Column({ default: false })
  isPenaltyTaker: boolean;

  @Column({ default: false })
  isFreeKickTaker: boolean;
}
