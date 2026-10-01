import type { Role } from './models/User.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        email: string;
        isDirector: boolean;
        /** Compte soumis à la 2FA par la politique du client mais qui ne l'a pas encore activée. */
        pending2fa: boolean;
      };
    }
  }
}

export {};
