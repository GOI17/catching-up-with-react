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
  type PropsWithChildren,
} from "react";
import { createRoot } from "react-dom/client";
import { AsyncStore } from "./asyncStore";

class DIContainer {
  private services = new Map<string, unknown>();

  register<T>(name: string, factory: () => T): void {
    this.services.set(name, factory);
  }

  get<T>(name: string): T {
    const factory = this.services.get(name);
    if (!factory) throw new Error(`Service ${name} not found.`);

    return factory();
  }
}

const tables = {
  todos: "todos",
} as const;

interface CRUD<R, I> {
  get(resourceId: I): Promise<R | null>;
  getAll(): Promise<Array<R> | null>;
  getAll<F extends keyof R>(filter: F, value: R[F]): Promise<Array<R> | null>;
  create(resource: R): Promise<void>;
  update(id: I, resource: Partial<R>): Promise<void>;
  delete(resourceId: I): Promise<void>;
}

interface ITodoRepository extends CRUD<Todo, Todo["id"]> {
  get(resourceId: Todo["id"]): Promise<Todo | null>;
  getAll<F extends keyof Todo>(
    filter?: F,
    value?: Todo[F],
  ): Promise<Array<Todo> | null>;
  create(resource: Todo): Promise<void>;
  update(id: Todo["id"], resource: Partial<Todo>): Promise<void>;
  delete(resourceId: Todo["id"]): Promise<void>;
}

interface Todo {
  id: ReturnType<typeof globalThis.crypto.randomUUID>;
  title: string;
  description: string;
  status: "new" | "in_progress" | "completed";
  completedBy: string | null;
  createdAt: Date;
  createdBy: string;
}

class TodoRepository implements ITodoRepository {
  private store;

  constructor(store: IStore) {
    this.store = store;
  }

  async getAll<F extends keyof Todo>(
    filter?: F,
    value?: Todo[F],
  ): Promise<Array<Todo> | null> {
    const list = await this.store.getAll<Todo[]>();
    if (!filter) return list;
    if (!value) return list;
    return list?.filter((item) => item[filter] === value) || null;
  }

  get(resourceId: Todo["id"]) {
    return this.store.get<Todo["id"], Todo>(resourceId);
  }

  create(resource: Todo) {
    return this.store.add(resource);
  }

  update(id: Todo["id"], resource: Partial<Todo>) {
    return this.store.update({ id, ...resource });
  }

  delete(resourceId: Todo["id"]) {
    return this.store.delete(resourceId);
  }
}

interface IStore {
  get<I, R>(resourceId: I): Promise<R | null>;
  getAll<R>(): Promise<R | null>;
  add<R extends { id: string }>(resource: R): Promise<void>;
  update<R extends { id: string }>(resouce: Partial<R>): Promise<void>;
  delete<I>(resourceId: I): Promise<void>;
}

class TodosService {
  private todoRepository;

  constructor(todoRepository: ITodoRepository) {
    this.todoRepository = todoRepository;
  }

  create(resource: Todo) {
    return this.todoRepository.create(resource);
  }

  update(id: Todo["id"], resource: Partial<Todo>) {
    return this.todoRepository.update(id, resource);
  }

  delete(resourceId: Todo["id"]) {
    return this.todoRepository.delete(resourceId);
  }

  get(resourceId: Todo["id"]) {
    return this.todoRepository.get(resourceId);
  }

  getAll() {
    return this.todoRepository.getAll();
  }
}

const diContainer = new DIContainer();
diContainer.register("db", () => {
  const asyncStore = new AsyncStore(
    {
      todos: {
        id: { unique: true },
      },
    },
    5,
  );

  return {
    add: (resource: Todo) => asyncStore.create(tables.todos, resource),
    get: (resourceId: Todo["id"]) => asyncStore.get(tables.todos, resourceId),
    getAll: () => asyncStore.getAll(tables.todos),
    update: (resource: Todo) => asyncStore.update(tables.todos, resource),
    delete: (resourceId: Todo["id"]) =>
      asyncStore.delete(tables.todos, resourceId),
  };
});
diContainer.register(
  "todoRepository",
  () => new TodoRepository(diContainer.get("db")),
);
diContainer.register(
  "todoService",
  () => new TodosService(diContainer.get("todoRepository")),
);

const TodoStoreContext = createContext<DIContainer | null>(null);

const StoreProvider = ({ children }: PropsWithChildren) => {
  return (
    <TodoStoreContext.Provider value={diContainer}>
      {children}
    </TodoStoreContext.Provider>
  );
};

const useTodoStoreService = () => {
  const container = use(TodoStoreContext);

  if (!container) throw new Error("TodoStoreContext not found.");

  return container.get<TodosService>("todoService");
};

const useGetTodos = () => {
  const handlers = use(TodoUseCasesContext);

  return handlers?.getAll();
};

const useGetTodo = (id?: Todo["id"]) => {
  const handlers = use(TodoUseCasesContext);

  return id ? handlers?.get(id) : (id: Todo["id"]) => handlers?.get(id);
};

const useCreateTodo = () => {
  const handlers = use(TodoUseCasesContext);

  const onCreate = useCallback(
    (todo: Todo) => {
      return handlers?.create(todo);
    },
    [handlers],
  );

  return onCreate;
};

const useUpdateTodo = () => {
  const handlers = use(TodoUseCasesContext);

  const onUpdate = useCallback(
    (todo: Partial<Omit<Todo, "id">> & Pick<Todo, "id">) => {
      return handlers?.update(todo);
    },
    [handlers],
  );

  return onUpdate;
};

const useDeleteTodo = () => {
  const handlers = use(TodoUseCasesContext);

  const onDelete = useCallback(
    (todoId: Todo["id"]) => {
      return handlers?.delete(todoId);
    },
    [handlers],
  );

  return onDelete;
};

const TodoUseCasesContext = createContext<{
  todos: Todo[] | null;
  get: (id: Todo["id"]) => Promise<Todo | null>;
  getAll: () => Promise<Todo[] | null>;
  create: (todo: Todo) => Promise<void>;
  delete: (id: Todo["id"]) => Promise<void>;
  update: (todo: Partial<Omit<Todo, "id">> & Pick<Todo, "id">) => Promise<void>;
} | null>(null);

const TodoUseCasesProvider = ({ children }: PropsWithChildren) => {
  const service = useTodoStoreService();
  const [data, setData] = useState<Todo[] | null>(null);

  const onCreate = (todo: Todo) => {
    return service
      .create(todo)
      .then(() => service.getAll())
      .then((todos) => setData(todos));
  };

  const onUpdate = (todo: Partial<Omit<Todo, "id">> & Pick<Todo, "id">) => {
    return service
      .update(todo.id, todo)
      .then(() => service.getAll())
      .then((todos) => setData(todos));
  };

  const onDelete = (todoId: Todo["id"]) => {
    return service
      .delete(todoId)
      .then(() => service.getAll())
      .then((todos) => setData(todos));
  };

  const onGetTodos = () => {
    return service.getAll();
  };

  const onGetTodo = (todoId: Todo["id"]) =>
    service
      .get(todoId)
      .then(async (todo) => {
        return {
          todos: await service.getAll(),
          todo,
        };
      })
      .then(({ todos, todo }) => {
        setData(todos);

        return todo;
      });

  return (
    <TodoUseCasesContext.Provider
      value={{
        todos: data,
        getAll: onGetTodos,
        get: onGetTodo,
        create: onCreate,
        delete: onDelete,
        update: onUpdate,
      }}
    >
      {children}
    </TodoUseCasesContext.Provider>
  );
};

const App = () => {
  const formRef = useRef<HTMLLabelElement>(null);
  const todos = useGetTodos();
  const create = useCreateTodo();

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
      createdBy: "John Smith",
    };
    create(newTodo);
    (e.target as HTMLFormElement)?.reset();
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 30,
      }}
    >
      <form
        onSubmit={handleOnSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 15 }}
      >
        <label title="title" ref={formRef}>
          <span> Title:</span>
          <input
            name="title"
            type="text"
            placeholder="My awesome todo"
            required
          />
        </label>
        <label title="description">
          <span> Description:</span>
          <input
            name="description"
            type="text"
            placeholder="I have to take my dogs out..."
            required
          />
        </label>
        <button type="submit">Create</button>
      </form>
      <ul
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          listStyle: "none",
          padding: 0,
          width: "100%",
        }}
      >
        <Suspense fallback="Loading...">
          {todos?.then((todos) => {
            if (!todos?.length)
              return (
                <h3 onClick={() => formRef.current?.focus()}>
                  No todos, click on me to create your first todo
                </h3>
              );
            return todos?.map((todo) => {
              return <Todo key={todo.id} {...todo} />;
            });
          })}
        </Suspense>
      </ul>
    </main>
  );
};

const Todo = ({
  id,
  status,
  title,
  description,
}: Pick<Todo, "id" | "status" | "title" | "description">) => {
  const [updateStatus, updateStatusSet] = useState(false);
  const todoDelete = useDeleteTodo();

  const handleOnDeleteTodo = (id: Todo["id"]) => () => {
    todoDelete(id);
  };

  const handleOnUpdateTodoStatus = () => {
    updateStatusSet(true);
  };

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
          {updateStatus ? (
            <select>
              <option>New</option>
            </select>
          ) : (
            <p onClick={handleOnUpdateTodoStatus}>{status.replace("_", " ")}</p>
          )}
          <p>{description}</p>
        </section>
        <section>
          <button>Edit</button>
          <button onClick={handleOnDeleteTodo(id)}>Delete</button>
        </section>
      </article>
    </li>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <TodoUseCasesProvider>
        <App />
      </TodoUseCasesProvider>
    </StoreProvider>
  </StrictMode>,
);
