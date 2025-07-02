import { createContext, StrictMode, Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PropsWithChildren } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const tables = {
  todos: "todos"
}

interface CRUD<R, I> {
  get(resourceId: I): Promise<R | null>;
  getAll(): Promise<Array<R> | null>;
  getAll<F extends keyof R>(filter: F, value: R[F]): Promise<Array<R> | null>;
  create(resource: R): Promise<void>;
  update(id: I, resource: Partial<R>): Promise<void>;
  delete(resourceId: I): Promise<void>;
}

interface DataSource<R, I> {
  get(resourceId: I): Promise<R | null>;
  getAll(): Promise<Array<R> | null>;
  create(resource: R): Promise<void>;
  update(resource: Partial<R>): Promise<void>;
  delete(resourceId: I): Promise<void>;
}


class TodosStore implements DataSource<Todo, Todo["id"]> {
  _store: Promise<IDBDatabase | null>;

  _initializeStore(): Promise<IDBDatabase | null> {
    return new Promise((resolve, reject) => {
      const store = globalThis.indexedDB.open("react-with-use", 4);

      const onDbSuccess = (event: Event) => {
        const hasResult = event.target !== null && 'result' in event.target;
        if (!hasResult) throw new Error("No db found");

        const db = event.target.result as IDBDatabase;
        db.onversionchange = function() {
          const table = this?.createObjectStore(tables.todos)
          table?.createIndex("id", "id", { unique: true });
          table?.createIndex("title", "title", { unique: true });
        }

        resolve(db);
      };

      const onDbError = () => {
        reject("TodosStore: Db error.");
      };

      const onDbBlocked = () => {
        reject("TodosStore: Db blocked.");
      };

      const onDbUpgrade = (event: Event) => {
        const hasResult = event.target !== null && 'result' in event.target;
        if (!hasResult) throw new Error("No db found");
        const db = event.target.result as IDBDatabase;
        const table = db?.createObjectStore(tables.todos)
        table?.createIndex("id", "id", { unique: true });
        table?.createIndex("title", "title", { unique: true });
      };

      store.onsuccess = onDbSuccess;
      store.onerror = onDbError;
      store.onblocked = onDbBlocked;
      store.onupgradeneeded = onDbUpgrade;
    });

  }

  constructor() {
    this._store = this._initializeStore();
  }

  async get(resourceId: Todo["id"]): Promise<Todo | null> {
    try {
      const transaction = (await this._store)?.transaction(tables.todos, "readwrite")
      if (!transaction) {
        console.log("TodosStore: No transaction found.")
        return Promise.resolve(null);
      };
      const store = transaction.objectStore(tables.todos);
      if (!store) {
        console.log("TodosStore: No creator method found.")
        return Promise.resolve(null);
      };
      return Promise.resolve(store?.get(resourceId).result as Todo);
    } catch (error) {
      throw new Error("TodosStore: Get query failed.");
    }
  }

  async getAll(): Promise<Todo[] | null> {
    try {
      const transaction = (await this._store)?.transaction(tables.todos, "readwrite")
      if (!transaction) {
        console.log("TodosStore: No transaction found.")
        return Promise.resolve(null);
      };
      const store = transaction.objectStore(tables.todos);
      if (!store) {
        console.log("TodosStore: No creator method found.")
        return Promise.resolve(null);
      };
      return new Promise((resolve, reject) => {
        const result = store.getAll();
        result.onerror = () => {
          reject();
        }
        result.onsuccess = (e) => {
          console.log({ e })
          resolve(e.target.result as Todo[])
        }
      });
    } catch (error) {
      throw new Error("TodosStore: Get query failed.");
    }
  }

  async create(resource: Todo): Promise<void> {
    try {
      const transaction = (await this._store)?.transaction(tables.todos, "readwrite")
      if (!transaction) {
        throw new Error("TodosStore: No creator method found.");
      };
      const store = transaction.objectStore(tables.todos);
      if (!store) {
        throw new Error("TodosStore: No creator method found.");
      };
      return new Promise((resolve, reject) => {
        const result = store?.add(resource, resource.id);
        result.onsuccess = (e) => { console.log({ result: e }) }
        result.onerror = (e) => { console.log({ result: e }) }
        result.onerror = () => {
          reject();
        }
        result.onsuccess = (e) => {
          console.log({ e })
          resolve()
        }
      });
    } catch (error) {
      throw new Error("TodosStore: Get query failed.");
    }
  }

  async update(resource: Partial<Omit<Todo, "id">> & Pick<Todo, "id">): Promise<void> {
    try {
      const transaction = (await this._store)?.transaction(tables.todos, "readwrite")
      if (!transaction) {
        throw new Error("TodosStore: No creator method found.");
      };
      const store = transaction.objectStore(tables.todos);
      if (!store) {
        throw new Error("TodosStore: No creator method found.");
      };
      return new Promise((resolve, reject) => {
        const result = store?.put(resource, resource.id);
        result.onsuccess = (e) => { console.log({ result: e }) }
        result.onerror = (e) => { console.log({ result: e }) }
        result.onerror = () => {
          reject();
        }
        result.onsuccess = (e) => {
          console.log({ e })
          resolve()
        }
      });
    } catch (error) {
      throw new Error("TodosStore: Get query failed.");
    }
  }

  async delete(resourceId: Todo["id"]): Promise<void> {
    try {
      const transaction = (await this._store)?.transaction(tables.todos, "readwrite")
      if (!transaction) {
        throw new Error("TodosStore: No creator method found.");
      };
      const store = transaction.objectStore(tables.todos);
      if (!store) {
        throw new Error("TodosStore: No creator method found.");
      };
      return new Promise((resolve, reject) => {
        const result = store?.delete(resourceId);
        result.onsuccess = (e) => { console.log({ result: e }) }
        result.onerror = (e) => { console.log({ result: e }) }
        result.onerror = () => {
          reject();
        }
        result.onsuccess = (e) => {
          console.log({ e })
          resolve()
        }
      });
    } catch (error) {
      throw new Error("TodosStore: Get query failed.");
    }
  }
}

interface Todo {
  id: ReturnType<typeof globalThis.crypto.randomUUID>
  title: string;
  description: string;
  status: 'new' | 'in_progress' | 'completed';
  completedBy: string | null;
  createdAt: Date;
  createdBy: string;
}

class TodosService implements CRUD<Todo, Todo["id"]> {
  _source

  constructor(source: DataSource<Todo, Todo["id"]>) {
    this._source = source;
  }

  create(resource: Todo): Promise<void> {
    return this._source.create(resource);
  }

  update(id: Todo["id"], resource: Partial<Todo>): Promise<void> {
    const updates = { id, ...resource };
    return this._source.update(updates);
  }

  delete(resourceId: Todo["id"]): Promise<void> {
    return this._source.delete(resourceId);
  }

  async get(resourceId: Todo["id"]): Promise<Todo | null> {
    const result = await this._source.get(resourceId);
    if (!result) return null;
    return result;
  };

  async getAll<F extends keyof Todo>(filter?: F, value?: Todo[F]): Promise<Todo[] | null> {
    const list = await this._source.getAll();
    if (!filter) return list;
    if (!value) return list;
    const filteredList = list?.filter((v) => v[filter] === value);
    if (!filteredList) return Promise.resolve(null);

    return filteredList;
  };
}

const TodoStoreContext = createContext<CRUD<Todo, Todo["id"]> | null>(null);

const StoreProvider = ({ children }: PropsWithChildren<{}>) => {
  const store = useMemo(() => new TodosStore(), []);
  const service = useMemo(() => new TodosService(store), []);

  return (
    <TodoStoreContext.Provider value={service}>
      {children}
    </TodoStoreContext.Provider>
  )
}

const useGetTodos = () => {
  const ctx = use(TodoStoreContext);
  const [data, setData] = useState<Todo[]>([]);
  const refetched = useRef(false);

  const refetch = async () => {
    refetched.current = true;
    const res = await ctx?.getAll()
    if (!res) return;
    setData(res);
  }

  useEffect(() => () => {
    refetched.current = false;
  }, []);

  return {
    query: refetched.current ? Promise.resolve(data) : ctx?.getAll(),
    refetch
  };
}

const useCreateTodo = () => {
  const ctx = use(TodoStoreContext);

  const onCreate = useCallback((todo: Todo) => {
    ctx?.create(todo);
  }, []);

  return onCreate;
}

const App = () => {
  const { query: queryTodos, refetch } = useGetTodos();
  const todoCreator = useCreateTodo();

  const handleOnSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    const newTodo: Todo = {
      id: globalThis.crypto.randomUUID(),
      description: form.get("description") as Todo["description"],
      title: form.get("description") as Todo["title"],
      completedBy: null,
      createdAt: new Date(),
      status: "new",
      createdBy: "John Smith"
    }
    todoCreator(newTodo);
    (e.target as HTMLFormElement)?.reset();
    refetch();
  }

  return (<>
    <form onSubmit={handleOnSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      <label title='title'>
        <span> Title:</span>
        <input name='title' type='text' placeholder='My awesome todo' required />
      </label>
      <label title='description'>
        <span> Description:</span>
        <input name='description' type='text' placeholder='I have to take my dogs out...' required />
      </label>
      <button type='submit'>Create</button>
    </form>
    <ul style={{ listStyle: "none" }}>
      <Suspense fallback="Loading...">
        {queryTodos?.then((todos) => {
          return todos?.map((todo) => {
            return (
              <li key={todo.id}>
                <article>
                  <header>
                    <h1>{todo.title}</h1>
                  </header>
                  <section>
                    <p>{todo.description}</p>
                  </section>
                </article>
              </li>
            )
          })
        })}
      </Suspense>
    </ul>
  </>)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
