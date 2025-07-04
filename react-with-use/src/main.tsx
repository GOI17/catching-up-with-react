import {
  createContext,
  StrictMode,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PropsWithChildren
} from 'react'
import { createRoot } from 'react-dom/client'
import { AsyncStore } from './asyncStore'

const tables = {
  todos: 'todos'
} as const;

interface CRUD<R, I> {
  get(resourceId: I): Promise<R | null>;
  getAll(): Promise<Array<R> | null>;
  getAll<F extends keyof R>(filter: F, value: R[F]): Promise<Array<R> | null>;
  create(resource: R): Promise<void>;
  update(id: I, resource: Partial<R>): Promise<void>;
  delete(resourceId: I): Promise<void>;
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

  constructor(source: AsyncStore<Todo, Todo["id"]>) {
    this._source = source;
  }

  create(resource: Todo): Promise<void> {
    return this._source.create(tables.todos, resource);
  }

  update(id: Todo["id"], resource: Partial<Todo>): Promise<void> {
    const updates = { id, ...resource };
    return this._source.update(tables.todos, updates);
  }

  delete(resourceId: Todo["id"]): Promise<void> {
    return this._source.delete(tables.todos, resourceId);
  }

  async get(resourceId: Todo["id"]): Promise<Todo | null> {
    const result = await this._source.get(tables.todos, resourceId);
    if (!result) return null;
    return result;
  };

  async getAll<F extends keyof Todo>(filter?: F, value?: Todo[F]): Promise<Todo[] | null> {
    const list = await this._source.getAll(tables.todos);
    if (!filter) return list;
    if (!value) return list;
    const filteredList = list?.filter((v) => v[filter] === value);
    if (!filteredList) return Promise.resolve(null);

    return filteredList;
  };
}

const TodoStoreContext = createContext<CRUD<Todo, Todo["id"]> | null>(null);

const StoreProvider = ({ children }: PropsWithChildren<{}>) => {
  const store = useMemo(() => new AsyncStore<Todo, Todo["id"]>(), []);
  const service = useMemo(() => new TodosService(store), []);

  useEffect(() => {
  }, []);

  return (
    <TodoStoreContext.Provider value={service}>
      <Suspense fallback="Loading...">
        {store.createUserTables((creator) => {
          const table = creator(tables.todos)
          table.createIndex("id", "id", { unique: true });
          table.createIndex("title", "title", { unique: true });
        }).then(() => <>{children}</>)};
      </Suspense>
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

const useDeleteTodo = () => {
  const ctx = use(TodoStoreContext);

  const onDelete = useCallback((todoId: Todo["id"]) => {
    ctx?.delete(todoId);
  }, []);

  return onDelete;
}

const App = () => {
  const formRef = useRef<HTMLLabelElement>(null);
  const { query: queryTodos, refetch } = useGetTodos();
  const todoCreator = useCreateTodo();

  const handleOnSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    const newTodo: Todo = {
      id: globalThis.crypto.randomUUID(),
      description: form.get("description") as Todo["description"],
      title: form.get("title") as Todo["title"],
      completedBy: null,
      createdAt: new Date(),
      status: "new",
      createdBy: "John Smith"
    }
    todoCreator(newTodo);
    (e.target as HTMLFormElement)?.reset();
    refetch();
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 30 }}>
      <form onSubmit={handleOnSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <label title='title' ref={formRef}>
          <span> Title:</span>
          <input name='title' type='text' placeholder='My awesome todo' required />
        </label>
        <label title='description'>
          <span> Description:</span>
          <input name='description' type='text' placeholder='I have to take my dogs out...' required />
        </label>
        <button type='submit'>Create</button>
      </form>
      <ul style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        listStyle: "none",
        padding: 0,
        width: "100%",
      }}>
        <Suspense fallback="Loading...">
          {queryTodos?.then((todos) => {
            if (!todos?.length) return <h3 onClick={() => formRef.current?.focus()}>No todos, click on me to create your first todo</h3>
            return todos?.map((todo) => {
              return <Todo key={todo.id} {...todo} />
            })
          })}
        </Suspense>
      </ul>
    </main>
  );
}

const Todo = ({ id, status, title, description }: Pick<Todo, "id" | "status" | 'title' | "description">) => {
  const [updateStatus, updateStatusSet] = useState(false);
  const todoDelete = useDeleteTodo();

  const handleOnDeleteTodo = (id: Todo["id"]) => () => {
    todoDelete(id);
  }

  const handleOnUpdateTodoStatus = () => {
    updateStatusSet(true);
  }

  return (
    <li
      style={{
        border: "1px solid grey",
        flexGrow: 33.33,
        maxWidth: "33.33%",
        padding: 4,
      }}
      key={id}
    >
      <article>
        <header>
          <h1>{title}</h1>
        </header>
        <section>
          {updateStatus
            ? <select><option>New</option></select>
            : <p onClick={handleOnUpdateTodoStatus}>{status.replace("_", " ")}</p>
          }
          <p>{description}</p>
        </section>
        <section>
          <button>Edit</button>
          <button onClick={handleOnDeleteTodo(id)}>Delete</button>
        </section>
      </article>
    </li>
  )
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
