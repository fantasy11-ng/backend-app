import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}

  async create(user: Omit<User, 'id' | 'isActive'>) {
    console.log(user);
    await this.usersRepository.insert(user);
  }

  async update(id: string, user: Partial<User>) {
    await this.usersRepository.update({ id }, user);
  }

  async findOne({
    id,
    email,
  }: {
    id?: string;
    email?: string;
  }): Promise<User | null> {
    return email
      ? this.usersRepository.findOneBy({ email })
      : this.usersRepository.findOneBy({ id });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async remove(id: string): Promise<void> {
    await this.usersRepository.delete({ id });
  }

  async findOneByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ googleId });
  }

  async findOneByFacebookId(facebookId: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ facebookId });
  }

  async findByGoogleIdOrCreateUser(user: {
    email: string;
    phone?: string;
    fullName: string;
    googleId: string;
  }) {
    let userEntity = await this.findOneByGoogleId(user.googleId);
    if (!userEntity) {
      userEntity = new User();
      userEntity.email = user.email;
      userEntity.phone = user.phone;
      userEntity.fullName = user.fullName;
      userEntity.googleId = user.googleId;
      await this.usersRepository.save(userEntity);
    }

    return userEntity;
  }

  async findByFacebookIdOrCreateUser(user: {
    email: string;
    phone?: string;
    fullName: string;
    facebookId: string;
  }) {
    let userEntity = await this.findOneByFacebookId(user.facebookId);
    if (!userEntity) {
      userEntity = new User();
      userEntity.email = user.email;
      userEntity.phone = user.phone || '';
      userEntity.fullName = user.fullName;
      userEntity.facebookId = user.facebookId;
      await this.usersRepository.save(userEntity);
    }

    return userEntity;
  }
}
