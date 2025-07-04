interface DataSource<R, I> {
  get(table: string, resourceId: I): Promise<R | null>;
  getAll(table: string): Promise<Array<R> | null>;
  create(table: string, resource: R): Promise<void>;
  update(table: string, resource: Partial<Omit<R, "id">> & { id: I }): Promise<void>;
  delete(table: string, resourceId: I): Promise<void>;
}

export class AsyncStore<R extends {}, I extends IDBValidKey> implements DataSource<R, I> {
  _store: Promise<{ db: IDBDatabase, store: IDBOpenDBRequest } | null>;

  _initializeStore(): Promise<{ db: IDBDatabase, store: IDBOpenDBRequest } | null> {
    try {
      return new Promise((resolve, reject) => {
        const store = globalThis.indexedDB.open("react-with-use", 5);
        store.onsuccess = function(event: Event) {
          if (!isIDbRequest<IDBDatabase>(event.target)) throw new NoDbFoundError();

          return resolve({ db: event.target.result, store });
        };
        store.onerror = function(event) {
          if (!isIDbRequest<IDBDatabase>(event.target)) throw new NoDbFoundError();

          return reject(new OpeningDbError())
        };
        store.onblocked = function(event) {
          if (!isIDbRequest<IDBDatabase>(event.target)) throw new NoDbFoundError();

          return reject(new OpeningDbError())
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async _getTable(table: string) {
    try {
      const transaction = (await this._store)?.db?.transaction(table, "readwrite")
      if (!transaction) {
        throw new BaseError("No transaction found.");
      };
      const store = transaction.objectStore(table);
      if (!store) {
        throw new BaseError("No createObjectStore found.");
      };
      return store;
    } catch (error) {
      throw error;
    }
  }

  async createUserTables(tablesCreator: (creator: IDBDatabase['createObjectStore']) => void) {
    try {
      const store = (await this._store)?.store
      if (!store) throw new BaseError("createUserTables failed.");
      store.onupgradeneeded = function() {
        tablesCreator(this.transaction?.objectStore);
      }
    } catch (error) {
      throw error;
    }
  }

  constructor() {
    this._store = this._initializeStore();
  }

  async get(_table: string, resourceId: I): Promise<R | null> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      };
      const result = table.get(resourceId);
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target)) throw new BaseError("failed getting db result.");

          reject(event.target.error);
        }
        result.onsuccess = (event) => {
          if (!isIDbRequest<R>(event.target)) throw new BaseError("failed getting db result.");
          resolve(event.target.result)
        }
      });
    } catch (error) {
      throw new BaseError("Get query failed.");
    }
  }

  async getAll(_table: string): Promise<R[] | null> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      };
      const result = table.getAll();
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target)) throw new BaseError("failed getting db result.");

          reject(event.target.error);
        }
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target)) throw new BaseError("failed getting db result.");
          resolve(event.target.result)
        }
      });
    } catch (error) {
      throw new BaseError("GetAll query failed.");
    }
  }

  async create(_table: string, resource: R): Promise<void> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      };
      let result;
      if ("id" in resource) {
        result = table.add(resource, resource.id as I);
      } else {
        result = table.add(resource, globalThis.crypto.randomUUID());
      }
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target)) throw new BaseError("failed getting db result.");

          reject(event.target.error);
        }
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target)) throw new BaseError("failed getting db result.");
          resolve()
        }
      });
    } catch (error) {
      throw new BaseError("Create query failed.");
    }
  }

  async update(_table: string, resource: Partial<Omit<R, "id">> & { id: I }): Promise<void> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      };
      const result = table.put(resource, globalThis.crypto.randomUUID());
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target)) throw new BaseError("failed getting db result.");

          reject(event.target.error);
        }
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target)) throw new NoDbFoundError();
          resolve()
        }
      });
    } catch (error) {
      throw new BaseError("Update query failed.");
    }
  }

  async delete(_table: string, resourceId: I): Promise<void> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      };
      const result = table.delete(resourceId);
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target)) throw new BaseError("failed getting db result.");

          reject(event.target.error);
        }
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target)) throw new NoDbFoundError();
          resolve()
        }
      });
    } catch (error) {
      throw new Error("Get query failed.");
    }
  }
}

class BaseError extends Error {
  constructor(message: string) {
    super();
    this.name = "AsyncStore";
    this.message = message;
    this.stack = "";
  }
}

class NoDbFoundError extends BaseError {
  constructor() {
    super("failed, no db found");
  }
}

class OpeningDbError extends BaseError {
  constructor() {
    super("failed while opening indexedDB.");
  }
}


function isIDbRequest<E>(value: unknown): value is IDBRequest<E> {
  return typeof value !== "undefined" &&
    value !== null &&
    typeof value === "object" &&
    "result" in value
}
