export class TokenBucket {
  private tokens: number;
  private updatedAt: number;
  constructor(
    private capacity: number,
    private perSecond: number,
    private now = Date.now,
  ) {
    this.tokens = capacity;
    this.updatedAt = now();
  }
  take() {
    const time = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((time - this.updatedAt) * this.perSecond) / 1000,
    );
    this.updatedAt = time;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
