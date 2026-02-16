/** Weighted random selection among equally-scored candidates */
export class RandomPicker<T> {
  private items: Array<{ value: T; cumulativeWeight: number }> = [];
  private total = 0;

  add(value: T, weight = 1.0): void {
    if (weight <= 0) return;
    this.total += weight;
    this.items.push({ value, cumulativeWeight: this.total });
  }

  pick(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items[0].value;

    const r = Math.random() * this.total;
    for (const item of this.items) {
      if (r <= item.cumulativeWeight) return item.value;
    }
    return this.items[this.items.length - 1].value;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear(): void {
    this.items = [];
    this.total = 0;
  }

  get size(): number {
    return this.items.length;
  }
}
