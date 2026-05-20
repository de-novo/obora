(() => {
    "use strict";

    const storageKey = "chatTodoApp.todos";
    const state = {
        todos: [],
        currentFilter: "all",
    };

    const todoInput = document.getElementById("todo-input");
    const addBtn = document.getElementById("add-btn");
    const todoList = document.getElementById("todo-list");
    const todoCount = document.getElementById("todo-count");
    const clearCompletedBtn = document.getElementById("clear-completed-btn");
    const filterBtns = Array.from(document.querySelectorAll(".filter-btn"));

    const isTodo = (value) => (
        value
        && typeof value.id === "string"
        && typeof value.text === "string"
        && typeof value.completed === "boolean"
    );

    const parseTodos = (stored) => {
        try {
            const parsed = JSON.parse(stored ?? "[]");
            return Array.isArray(parsed) ? parsed.filter(isTodo) : [];
        } catch (error) {
            console.error("Failed to load todos:", error);
            return [];
        }
    };

    const saveTodos = () => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(state.todos));
        } catch (error) {
            console.error("Failed to save todos:", error);
        }
    };

    const generateId = () => (
        window.crypto?.randomUUID?.()
        ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    );

    const getFilteredTodos = () => {
        switch (state.currentFilter) {
            case "active":
                return state.todos.filter((todo) => !todo.completed);
            case "completed":
                return state.todos.filter((todo) => todo.completed);
            default:
                return state.todos;
        }
    };

    const setFilterButtonState = (filter) => {
        filterBtns.forEach((button) => {
            const isActive = button.dataset.filter === filter;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    };

    const createEmptyState = () => {
        const emptyMessage = document.createElement("li");
        emptyMessage.className = "empty-state";
        emptyMessage.textContent = state.currentFilter === "all"
            ? "할 일이 없습니다. 새로운 할 일을 추가해보세요!"
            : "해당 조건의 할 일이 없습니다.";
        return emptyMessage;
    };

    const editTodo = (id, newText) => {
        const trimmed = newText.trim();
        state.todos = trimmed
            ? state.todos.map((todo) => (
                todo.id === id ? { ...todo, text: trimmed } : todo
            ))
            : state.todos.filter((todo) => todo.id !== id);
        saveTodos();
        render();
    };

    const toggleTodo = (id) => {
        state.todos = state.todos.map((todo) => (
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
        ));
        saveTodos();
        render();
    };

    const deleteTodo = (id) => {
        state.todos = state.todos.filter((todo) => todo.id !== id);
        saveTodos();
        render();
    };

    const startEditing = (id, listItem) => {
        const todo = state.todos.find((candidate) => candidate.id === id);
        const textSpan = listItem.querySelector(".todo-text");

        if (!todo || !textSpan || listItem.querySelector(".todo-edit-input")) {
            return;
        }

        const input = document.createElement("input");
        input.type = "text";
        input.className = "todo-edit-input";
        input.value = todo.text;
        input.setAttribute("aria-label", `할 일 편집: ${todo.text}`);

        const commitEdit = () => editTodo(id, input.value);
        const cancelEdit = () => render();

        input.addEventListener("blur", commitEdit);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                input.removeEventListener("blur", commitEdit);
                commitEdit();
            }

            if (event.key === "Escape") {
                event.preventDefault();
                input.removeEventListener("blur", commitEdit);
                cancelEdit();
            }
        });

        listItem.replaceChild(input, textSpan);
        input.focus();
        input.select();
    };

    const createTodoItem = (todo) => {
        const listItem = document.createElement("li");
        const checkbox = document.createElement("input");
        const textSpan = document.createElement("span");
        const actions = document.createElement("div");
        const editBtn = document.createElement("button");
        const deleteBtn = document.createElement("button");

        listItem.className = `todo-item ${todo.completed ? "completed" : ""}`;
        listItem.setAttribute("role", "listitem");

        checkbox.type = "checkbox";
        checkbox.className = "todo-checkbox";
        checkbox.checked = todo.completed;
        checkbox.setAttribute("aria-label", `${todo.text} ${todo.completed ? "완료됨" : "미완료"}`);
        checkbox.addEventListener("change", () => toggleTodo(todo.id));

        textSpan.className = "todo-text";
        textSpan.textContent = todo.text;
        textSpan.addEventListener("dblclick", () => startEditing(todo.id, listItem));

        actions.className = "todo-actions";

        editBtn.className = "action-btn edit";
        editBtn.textContent = "✎";
        editBtn.setAttribute("aria-label", `${todo.text} 편집`);
        editBtn.addEventListener("click", () => startEditing(todo.id, listItem));

        deleteBtn.className = "action-btn delete";
        deleteBtn.textContent = "×";
        deleteBtn.setAttribute("aria-label", `${todo.text} 삭제`);
        deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

        actions.append(editBtn, deleteBtn);
        listItem.append(checkbox, textSpan, actions);
        return listItem;
    };

    const render = () => {
        const filteredTodos = getFilteredTodos();
        const activeCount = state.todos.filter((todo) => !todo.completed).length;
        const renderedItems = filteredTodos.length > 0
            ? filteredTodos.map(createTodoItem)
            : [createEmptyState()];

        todoCount.textContent = `${activeCount}개 남음`;
        clearCompletedBtn.style.visibility = state.todos.some((todo) => todo.completed)
            ? "visible"
            : "hidden";
        todoList.replaceChildren(...renderedItems);
    };

    const addTodo = (text) => {
        const trimmed = text.trim();

        if (!trimmed) {
            return;
        }

        state.todos = [
            ...state.todos,
            {
                id: generateId(),
                text: trimmed,
                completed: false,
                createdAt: new Date().toISOString(),
            },
        ];
        saveTodos();
        render();
        todoInput.value = "";
        todoInput.focus();
    };

    const clearCompleted = () => {
        state.todos = state.todos.filter((todo) => !todo.completed);
        saveTodos();
        render();
    };

    const setFilter = (filter) => {
        state.currentFilter = filter;
        setFilterButtonState(filter);
        render();
    };

    addBtn.addEventListener("click", () => addTodo(todoInput.value));
    todoInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            addTodo(todoInput.value);
        }
    });
    clearCompletedBtn.addEventListener("click", clearCompleted);
    filterBtns.forEach((button) => {
        button.addEventListener("click", () => setFilter(button.dataset.filter ?? "all"));
    });

    state.todos = parseTodos(localStorage.getItem(storageKey));
    setFilterButtonState(state.currentFilter);
    render();
})();
