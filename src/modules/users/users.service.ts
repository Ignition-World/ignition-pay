import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Find active users (soft-deleted records are automatically excluded)
   */
  async findAllActive(): Promise<User[]> {
    return this.userRepository.find();
  }

  /**
   * Find an active user by ID
   */
  async findActiveById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Active user with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Custom QueryBuilder lookup enforcing soft-delete filter explicitly
   */
  async findActiveByEmail(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email: email.toLowerCase() })
      .andWhere('user.deletedAt IS NULL')
      .getOne();
  }

  /**
   * Soft-delete user by setting deletedAt timestamp
   */
  async softDeleteUser(id: string): Promise<void> {
    const result = await this.userRepository.softDelete(id);
    if (!result.affected) {
      throw new NotFoundException(`User with ID ${id} not found or already deleted`);
    }
  }

  /**
   * Restore a soft-deleted user
   */
  async restoreUser(id: string): Promise<User> {
    // Find soft-deleted user including deleted records
    const user = await this.userRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (!user.deletedAt) {
      return user; // User is not deleted
    }

    await this.userRepository.restore(id);
    return this.findActiveById(id);
  }

  async updateProfile(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Merge validated DTO updates onto existing user entity
    Object.assign(user, updateUserDto);

    return this.userRepository.save(user);
  }
}