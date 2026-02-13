export interface AuthUser {
  id: string;
  email?: string;
  passwordHash?: string;
  isAnonymous: boolean;
  ugroups: string[];
  createdAt: string;
  lastLoginAt: string;
  metadata?: Record<string, unknown>;
}

export interface AuthSession {
  sid: string;
  owner: string;
  isAnonymous: boolean;
  ugroups: string[];
  iat: number;
  exp: number;
}

export interface AuthProvider {
  name: string;
  authenticate(
    credentials: Record<string, string>
  ): Promise<{ owner: string; user: Partial<AuthUser> }>;
}

export interface AuthConfig {
  secret: string;
  sessionTtlSeconds: number;
  allowAnonymous: boolean;
  providers: AuthProvider[];
}
