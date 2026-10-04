export interface PlatformAdminProps {
  id: string;
  email: string;
  authUserId?: string | null;
}

export class PlatformAdmin {
  private props: { id: string; email: string; authUserId: string | null };

  private constructor(props: {
    id: string;
    email: string;
    authUserId: string | null;
  }) {
    this.props = props;
  }

  static reconstitute(props: PlatformAdminProps): PlatformAdmin {
    return new PlatformAdmin({
      id: props.id,
      email: props.email,
      authUserId: props.authUserId ?? null,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get authUserId(): string | null {
    return this.props.authUserId;
  }
}
