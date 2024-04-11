import { Player } from 'src/modules/players/entities/player.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Team {
  @PrimaryGeneratedColumn('uuid')
  userId: string;
  @OneToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  logo: string;
  @Column()
  name: string;

  @ManyToMany(() => Player)
  @JoinTable()
  squad: Player[];
  @Column('simple-array')
  sideline: number[];
}
