import { Role, User } from '@prisma/client';

export type AuthenticatedUser = Omit<User, 'password'> & { role: Role };
