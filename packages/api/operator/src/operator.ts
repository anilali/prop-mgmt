export interface Operator {
  readonly authUserId: string;
  readonly email: string;
  readonly name: string;
}

export function mapSessionToOperator(
  session: { user: { id: string; email: string; name: string } } | null,
): Operator | null {
  if (!session) return null;
  return {
    authUserId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
