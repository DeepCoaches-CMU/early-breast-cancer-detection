import React, { createContext, useContext } from 'react';
import { User } from 'firebase/auth';

export const UserContext = createContext<User | null>(null);

export function useUser(): User | null {
  return useContext(UserContext);
}
