const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAddress {
  private constructor(readonly value: string) {}

  static parse(raw: string): EmailAddress {
    const value = raw.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      throw new Error(`Invalid email address: ${raw}`);
    }
    return new EmailAddress(value);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
