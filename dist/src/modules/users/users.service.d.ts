import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
export declare class UsersService {
    private readonly userRepository;
    constructor(userRepository: Repository<User>);
    /**
     * Find active users (soft-deleted records are automatically excluded)
     */
    findAllActive(): Promise<User[]>;
    /**
     * Find an active user by ID
     */
    findActiveById(id: string): Promise<User>;
    /**
     * Custom QueryBuilder lookup enforcing soft-delete filter explicitly
     */
    findActiveByEmail(email: string): Promise<User | null>;
    /**
     * Soft-delete user by setting deletedAt timestamp
     */
    softDeleteUser(id: string): Promise<void>;
    /**
     * Restore a soft-deleted user
     */
    restoreUser(id: string): Promise<User>;
    updateProfile(id: string, updateUserDto: UpdateUserDto): Promise<User>;
}
