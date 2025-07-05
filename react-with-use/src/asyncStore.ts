interface Store {
  db: IDBDatabase;
  store: IDBOpenDBRequest;
}

type Tables = Record<string, Record<string, IDBIndexParameters>>;

interface DataSource<R, I> {
  get(table: string, resourceId: I): Promise<R | null>;
  getAll(table: string): Promise<Array<R> | null>;
  create(table: string, resource: R): Promise<void>;
  update(
    table: string,
    resource: Partial<Omit<R, "id">> & { id: I },
  ): Promise<void>;
  delete(table: string, resourceId: I): Promise<void>;
}

export class AsyncStore<R extends {}, I extends IDBValidKey>
  implements DataSource<R, I>
{
  _store: Promise<Store | null>;

  /**
   *
   * @param {Tables} tables User tables
   * @param {number} dbVersion Database version
   * @description Update this number if you are adding new tables ("migrations")
   */
  constructor(tables: Tables, dbVersion: number) {
    this._store = this._initializeStore(tables, dbVersion);
  }

  _initializeStore(tables: Tables, dbVersion: number): Promise<Store | null> {
    return new Promise((resolve, reject) => {
      const store = globalThis.indexedDB.open("react-with-use", dbVersion);
      store.onsuccess = function (event: Event) {
        if (!isIDbRequest<IDBDatabase>(event.target))
          throw new NoDbFoundError();

        event.target.result.onversionchange = function () {
          createTables.bind(this)(tables);
        };

        createTables.bind(this.result)(tables);

        return resolve({ db: event.target.result, store });
      };
      store.onerror = function (event) {
        if (!isIDbRequest<IDBDatabase>(event.target))
          throw new NoDbFoundError();

        return reject(new OpeningDbError());
      };
      store.onblocked = function (event) {
        if (!isIDbRequest<IDBDatabase>(event.target))
          throw new NoDbFoundError();

        return reject(new OpeningDbError());
      };
      store.onupgradeneeded = function (event) {
        if (!isIDbRequest<IDBDatabase>(event.target))
          throw new NoDbFoundError();

        createTables.bind(this.result)(tables);
      };

      function createTables(this: IDBDatabase, tables: Tables) {
        const hasUpdates = Object.keys(tables).every(
          (table) => !this.objectStoreNames.contains(table),
        );
        if (!hasUpdates) {
          return;
        }
        const missingTables = Object.keys(tables)
          .filter((table) => !this.objectStoreNames.contains(table))
          .reduce(
            (acc, curr) => ({ ...acc, [curr]: tables[curr] }),
            {} as Tables,
          );
        Object.entries(missingTables).forEach(([tableName, tableOptions]) => {
          const table = this.createObjectStore(tableName);
          Object.entries(tableOptions).forEach(([tableKey, options]) => {
            table.createIndex(tableKey, tableKey, options);
          });
        });
      }
    });
  }

  async _getTable(table: string) {
    const store = await this._store.then((_store) => {
      if (_store === null) throw new NoDbFoundError();
      return _store;
    });
    const transaction = store.db.transaction(table, "readwrite");
    if (!transaction) {
      throw new BaseError("No transaction found.");
    }
    const objectStore = transaction.objectStore(table);
    if (!objectStore) {
      throw new BaseError("No createObjectStore found.");
    }
    return objectStore;
  }

  async get(_table: string, resourceId: I): Promise<R | null> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      }
      const result = table.get(resourceId);
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target))
            throw new BaseError("failed getting db result.");

          reject(event.target.error);
        };
        result.onsuccess = (event) => {
          if (!isIDbRequest<R>(event.target))
            throw new BaseError("failed getting db result.");
          resolve(event.target.result);
        };
      });
    } catch (error) {
      if (!(error instanceof Error)) throw new UnknownError();
      throw new BaseError(`Get query failed. ${error.toString()}`);
    }
  }

  async getAll(_table: string): Promise<R[] | null> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      }
      const result = table.getAll();
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target))
            throw new BaseError("failed getting db result.");

          reject(event.target.error);
        };
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target))
            throw new BaseError("failed getting db result.");
          resolve(event.target.result);
        };
      });
    } catch (error) {
      throw new BaseError(`GetAll query failed. ${error.toString()}`);
    }
  }

  async create(_table: string, resource: R): Promise<void> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      }
      let result;
      if ("id" in resource) {
        result = table.add(resource, resource.id as I);
      } else {
        result = table.add(resource, globalThis.crypto.randomUUID());
      }
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target))
            throw new BaseError("failed getting db result.");

          reject(event.target.error);
        };
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target))
            throw new BaseError("failed getting db result.");
          resolve();
        };
      });
    } catch (error) {
      throw new BaseError("Create query failed.");
    }
  }

  async update(
    _table: string,
    resource: Partial<Omit<R, "id">> & { id: I },
  ): Promise<void> {
    try {
      const table = await this._getTable(_table);
      if (!table) {
        throw new BaseError("No createObjectStore found.");
      }
      const result = table.put(resource, globalThis.crypto.randomUUID());
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target))
            throw new BaseError("failed getting db result.");

          reject(event.target.error);
        };
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target)) throw new NoDbFoundError();
          resolve();
        };
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
      }
      const result = table.delete(resourceId);
      return new Promise((resolve, reject) => {
        result.onerror = (event) => {
          if (!isIDbRequest(event.target))
            throw new BaseError("failed getting db result.");

          reject(event.target.error);
        };
        result.onsuccess = (event) => {
          if (!isIDbRequest<R[]>(event.target)) throw new NoDbFoundError();
          resolve();
        };
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
    super("Failed, no db found");
  }
}

class OpeningDbError extends BaseError {
  constructor() {
    super("Failed while opening indexedDB.");
  }
}

class UnknownError extends BaseError {
  constructor() {
    super("Found an unknown error.");
  }
}

function isIDbRequest<E>(value: unknown): value is IDBRequest<E> {
  return (
    typeof value !== "undefined" &&
    value !== null &&
    typeof value === "object" &&
    "result" in value
  );
}
