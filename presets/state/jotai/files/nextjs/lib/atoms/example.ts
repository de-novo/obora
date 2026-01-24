import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * Primitive Atoms
 * Basic state values
 */
export const countAtom = atom(0);
export const textAtom = atom("");
export const isLoadingAtom = atom(false);

/**
 * Derived Atoms (Read-only)
 * Computed values from other atoms
 */
export const doubleCountAtom = atom((get) => get(countAtom) * 2);

export const uppercaseTextAtom = atom((get) => get(textAtom).toUpperCase());

/**
 * Writable Derived Atoms
 * Custom read and write logic
 */
export const countWithMinMaxAtom = atom(
  (get) => get(countAtom),
  (get, set, newValue: number) => {
    // Clamp between 0 and 100
    set(countAtom, Math.max(0, Math.min(100, newValue)));
  }
);

/**
 * Async Atoms
 * Atoms that fetch data
 */
interface User {
  id: string;
  name: string;
  email: string;
}

export const userIdAtom = atom<string | null>(null);

export const userAtom = atom(async (get) => {
  const userId = get(userIdAtom);
  if (!userId) return null;

  const response = await fetch(`/api/users/${userId}`);
  if (!response.ok) throw new Error("Failed to fetch user");

  return response.json() as Promise<User>;
});

/**
 * Atoms with Storage (Persistence)
 * Values persist in localStorage
 */
export const themeAtom = atomWithStorage<"light" | "dark">("theme", "light");

interface Settings {
  notifications: boolean;
  language: string;
  timezone: string;
}

export const settingsAtom = atomWithStorage<Settings>("settings", {
  notifications: true,
  language: "en",
  timezone: "UTC",
});

/**
 * Atom Family Pattern
 * Create atoms dynamically with parameters
 */
interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export const todosAtom = atom<Todo[]>([]);

export const todoByIdAtom = (id: string) =>
  atom(
    (get) => get(todosAtom).find((todo) => todo.id === id),
    (get, set, update: Partial<Todo>) => {
      set(todosAtom, (todos) =>
        todos.map((todo) => (todo.id === id ? { ...todo, ...update } : todo))
      );
    }
  );

export const completedTodosAtom = atom((get) =>
  get(todosAtom).filter((todo) => todo.completed)
);

export const pendingTodosAtom = atom((get) =>
  get(todosAtom).filter((todo) => !todo.completed)
);

/**
 * Action Atoms
 * Atoms for mutations/actions
 */
export const addTodoAtom = atom(null, (get, set, title: string) => {
  const newTodo: Todo = {
    id: crypto.randomUUID(),
    title,
    completed: false,
  };
  set(todosAtom, (todos) => [...todos, newTodo]);
});

export const removeTodoAtom = atom(null, (get, set, id: string) => {
  set(todosAtom, (todos) => todos.filter((todo) => todo.id !== id));
});

export const toggleTodoAtom = atom(null, (get, set, id: string) => {
  set(todosAtom, (todos) =>
    todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    )
  );
});
