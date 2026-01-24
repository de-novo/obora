export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
};

export type AuthSession = {
  userId: string | null;
  sessionId: string | null;
  orgId: string | null;
};
