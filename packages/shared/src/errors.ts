export class ConcurrentUpdateError extends Error {
  constructor(message = "Another change was saved at the same time.") {
    super(message);
    this.name = "ConcurrentUpdateError";
  }
}
