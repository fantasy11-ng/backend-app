import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { Player } from '@/modules/players/entities/player.entity';
import { TransferType } from '@/modules/fantasy/fantasy.types';

@Entity()
export class FantasyTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, (team) => team.transfers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @ManyToOne(() => Player, { nullable: true })
  @JoinColumn({ name: 'playerOutId' })
  playerOut?: Player | null;

  @Column({ nullable: true })
  playerOutId?: number | null;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'playerInId' })
  playerIn: Player;

  @Column()
  playerInId: number;

  @Column({ type: 'int', default: 0 })
  amountOut: number;

  @Column({ type: 'int', default: 0 })
  amountIn: number;

  @Column({ type: 'int', default: 0 })
  netAmount: number;

  @Column({ type: 'enum', enum: TransferType })
  type: TransferType;

  @Column({ nullable: true })
  fixtureId?: number;

  @Column({ nullable: true })
  triggeredByUserId?: string;

  @CreateDateColumn()
  createdAt: Date;
}
