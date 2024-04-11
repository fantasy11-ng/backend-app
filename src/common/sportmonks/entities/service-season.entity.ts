import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ServiceSeason {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;

  @Column()
  serviceId: number;
  @Column()
  externalLeagueId: number;

  //  "id": 21644,
  //        "sport_id": 1,
  //        "league_id": 271,
  //        "tie_breaker_rule_id": 171,
  //        "name": "2023/2024",
  //        "finished": false,
  //        "pending": false,
  //        "is_current": true,
  //        "starting_at": "2023-07-21",
  //        "ending_at": "2024-05-26",
  //        "standings_recalculated_at": "2024-04-05 18:58:03",
  //        "games_in_current_week": true,
}
