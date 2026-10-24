export type LoginRequest = {
  userName: string;
  password: string;
};

export type AuthUser = {
  id: string;
  name: string;
  roles: string[];
  outlets: string[];
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};
