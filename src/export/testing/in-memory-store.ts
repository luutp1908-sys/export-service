import { randomUUID } from 'crypto';

export class InMemoryStore<T extends { id: string; createdAt: Date; updatedAt: Date }> {
  private readonly data = new Map<string, T>();

  create(factory: (base: { id: string; createdAt: Date; updatedAt: Date }) => T): T {
    const now = new Date();
    const entity = factory({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.data.set(entity.id, entity);
    return entity;
  }

  findById(id: string): T | null {
    return this.data.get(id) ?? null;
  }

  set(id: string, value: T): void {
    this.data.set(id, value);
  }
}
