export type DataSource = 'supabase' | 'local-legacy' | 'simulation';
export interface ReadRepository<T> {
  readonly source: DataSource;
  list(): Promise<readonly T[]>;
}

export interface EntityRepository<T, CreateInput, UpdateInput = CreateInput> extends ReadRepository<T> {
  create(input: CreateInput): Promise<T>;
  update(id: string, input: UpdateInput): Promise<T>;
}

export interface DuplicateGroup { key: string; ids: string[] }
export function findDuplicates<T extends { id: string }>(records: readonly T[], keyOf: (record: T) => string): DuplicateGroup[] {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const key = keyOf(record).trim().toLocaleLowerCase('es-PE');
    if (key) groups.set(key, [...(groups.get(key) ?? []), record.id]);
  }
  return [...groups].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ key, ids }));
}
