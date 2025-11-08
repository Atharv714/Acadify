declare module "idb-keyval" {
  export type UseStore = any;
  export function createStore(dbName?: string, storeName?: string): UseStore;
  export function get<T = any>(key: IDBValidKey, store?: UseStore): Promise<T | undefined>;
  export function set<T = any>(key: IDBValidKey, value: T, store?: UseStore): Promise<void>;
  export function del(key: IDBValidKey, store?: UseStore): Promise<void>;
  export function keys(store?: UseStore): Promise<IDBValidKey[]>;
}

declare module "flexsearch" {
  export type EnrichResult = Array<{ field: string; result: Array<{ id: string | number; score?: number }> }>;
  export interface DocumentOptions<T> {
    preset?: string;
    worker?: boolean | number;
    cache?: boolean | number;
    tokenize?: string;
    document: {
      id: keyof T & string;
      index: Array<keyof T & string>;
      store?: Array<keyof T & string>;
    };
  }
  export class Document<T = any> {
    constructor(options: DocumentOptions<T>);
    add(doc: T | T[]): void;
    update(doc: T | T[]): void;
    remove(id: string | number): void;
    search(options: { query: string; limit?: number; suggest?: boolean; enrich?: boolean }): Promise<EnrichResult> | EnrichResult;
    export(cb: (key: string, data: any) => void | Promise<void>): Promise<void>;
    import(key: string, data: any): Promise<void>;
    get(id: string | number): T | null;
  }
  const FlexSearch: { Document: typeof Document };
  export default FlexSearch;
}
