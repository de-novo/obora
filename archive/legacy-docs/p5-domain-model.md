# TodoApp - Domain Model

**Date:** 2026-03-15
**Artifact Type:** Domain Model & Entity Design
**Status:** Final
**Based on:** MVP Scope Definition (p4-mvp-scope.md)

---

## Overview

The domain model defines the core entities, their attributes, relationships, and lifecycle behaviors for the TodoApp. This model supports the MVP v1.0 features (M1-M8) while providing a foundation for future enhancements (v1.1+ and v2.0+).

### Design Principles

1. **Simplicity First** - MVP entities contain only essential attributes
2. **Future-Ready** - Extensible structure for post-MVP features
3. **Local-First** - Optimized for IndexedDB local storage
4. **JTBD-Aligned** - Each entity directly supports user Jobs To Be Done

---

## Entity Diagram

```
┌─────────────┐       1..*       ┌─────────────┐
│   Project   │◄─────────────────│    Task     │
├─────────────┤                  ├─────────────┤
│ id          │                  │ id          │
│ name        │                  │ title       │
│ color       │                  │ description │
│ icon        │                  │ priority    │
│ createdAt   │                  │ status      │
│ position    │                  │ dueDate     │
└─────────────┘                  │ createdAt   │
                                  │ updatedAt   │
                         1..*     │ position    │
┌─────────────┐───────────────────│ projectId   │◄─────┘
│    Tag      │                  └─────────────┘
├─────────────┤                           1..*
│ id          │                  ┌─────────────┐
│ name        │◄─────────────────│  Reminder   │
│ color       │                  ├─────────────┤
│ createdAt   │                  │ id          │
└─────────────┘                  │ taskId      │
                                  │ triggerTime │
                                  │ status      │
                                  │ type        │
                                  │ createdAt   │
                                  └─────────────┘
```

---

## Core Entities

### 1. Task

The central entity representing a single unit of work or activity.

| Attribute | Type | Constraints | MVP Required | Description |
|-----------|------|-------------|--------------|-------------|
| **id** | `string` (UUID) | Primary key, required | ✅ Yes | Unique identifier |
| **title** | `string` | 1-200 chars, required | ✅ Yes | Task name/title |
| **description** | `string` | Max 2000 chars, optional | ✅ Yes | Detailed notes/notes (M7) |
| **priority** | `enum` | HIGH, MEDIUM, LOW | ✅ Yes | Task priority level (M3) |
| **status** | `enum` | ACTIVE, COMPLETED, ARCHIVED | ✅ Yes | Task completion state (M6) |
| **dueDate** | `datetime` | ISO-8601, optional | ✅ Yes | Deadline (M5, S1) |
| **projectId** | `string` | Foreign key, nullable | ✅ Yes | Associated project (M2) |
| **position** | `number` | Integer, sortable | ✅ Yes | Order in list view |
| **createdAt** | `datetime` | ISO-8601, required | ✅ Yes | Creation timestamp |
| **updatedAt** | `datetime` | ISO-8601, required | ✅ Yes | Last modification timestamp |

**Post-MVP Extensions (v1.1+):**
- `parentId` → Self-referencing for subtasks (S5)
- `recurrenceRule` → Recurring task config (S4)
- `completedAt` → Completion timestamp (S2)
- `estimatedTime` → Time estimate in minutes (C6)
- `actualTime` → Actual time tracked (C6)
- `dependencies` → Array of blocking task IDs (C7)

**Business Rules:**
1. Title is the only required field at creation
2. Default priority is MEDIUM
3. Default status is ACTIVE
4. Deleting a project reassigns its tasks to null (projectless) or requires confirmation
5. Position reordering updates all affected tasks

**JTBD Support:**
- JTBD 1: Core entity for task capture, organization, completion

---

### 2. Project

Represents a context or domain for grouping tasks (Work, Personal, Household, or custom projects).

| Attribute | Type | Constraints | MVP Required | Description |
|-----------|------|-------------|--------------|-------------|
| **id** | `string` (UUID) | Primary key, required | ✅ Yes | Unique identifier |
| **name** | `string` | 1-50 chars, required | ✅ Yes | Project name |
| **color** | `string` | Hex color code, required | ✅ Yes | Visual identifier |
| **icon** | `string` | Emoji or icon name, required | ✅ Yes | Visual marker |
| **createdAt** | `datetime` | ISO-8601, required | ✅ Yes | Creation timestamp |
| **position** | `number` | Integer, sortable | ✅ Yes | Display order |

**MVP Default Projects:**
| ID | Name | Color | Icon |
|----|------|-------|------|
| `proj-work` | Work | `#3B82F6` | 💼 |
| `proj-personal` | Personal | `#10B981` | 🏠 |
| `proj-household` | Household | `#F59E0B` | 🧹 |

**Post-MVP Extensions (v1.1+):**
- `description` → Project details
- `isArchived` → Hide completed projects
- `parentId` → Nested projects (C1 domain hierarchy)

**Business Rules:**
1. Project name must be unique
2. At least one project must exist (default projects)
3. Deleting a project with tasks requires user confirmation
4. Position determines display order in category filter (M2, M7)

**JTBD Support:**
- JTBD 1: Context categorization (M2)
- JTBD 3: Domain-specific organization (C1-C3)

---

### 3. Tag

Flexible labels for cross-project task categorization and filtering.

| Attribute | Type | Constraints | MVP Required | Description |
|-----------|------|-------------|--------------|-------------|
| **id** | `string` (UUID) | Primary key, required | ✅ Yes | Unique identifier |
| **name** | `string` | 1-30 chars, required | ✅ Yes | Tag name |
| **color** | `string` | Hex color code, required | ✅ Yes | Visual identifier |
| **createdAt** | `datetime` | ISO-8601, required | ✅ Yes | Creation timestamp |

**Tag-Task Relationship (Many-to-Many):**
Implemented as a join table `TaskTag`:
| Attribute | Type | Description |
|-----------|------|-------------|
| **taskId** | `string` | Foreign key to Task |
| **tagId** | `string` | Foreign key to Tag |

**Post-MVP Extensions (v2.0+):**
- `parentId` → Nested tag hierarchy
- `isPinned` → Quick filter shortcuts

**Business Rules:**
1. Tag names are case-insensitive unique
2. A task can have zero to many tags
3. A tag with no tasks can be deleted
4. Deleting a tag removes it from all tasks

**JTBD Support:**
- JTBD 1: Enhanced categorization (M2)
- JTBD 1: Advanced filtering (M7)

---

### 4. Reminder

Notifications for time-sensitive tasks (foundational for v1.1+ S1).

| Attribute | Type | Constraints | MVP Required | Description |
|-----------|------|-------------|--------------|-------------|
| **id** | `string` (UUID) | Primary key, required | ✅ Yes | Unique identifier |
| **taskId** | `string` | Foreign key, required | ✅ Yes | Associated task |
| **triggerTime** | `datetime` | ISO-8601, required | ✅ Yes | When to trigger |
| **status** | `enum` | PENDING, FIRED, DISMISSED | ✅ Yes | Reminder state |
| **type** | `enum` | ON_DUE, BEFORE_DUE, CUSTOM | ✅ Yes | Reminder type |
| **createdAt** | `datetime` | ISO-8601, required | ✅ Yes | Creation timestamp |

**Reminder Types:**
| Type | Description | Trigger Logic |
|------|-------------|---------------|
| `ON_DUE` | Alert at due date time | `triggerTime = task.dueDate` |
| `BEFORE_DUE` | Alert before due date | `triggerTime = task.dueDate - offset` |
| `CUSTOM` | Custom time | User-specified absolute time |

**Post-MVP Extensions (v1.1+):**
- `offsetMinutes` → Before due offset (e.g., 15 min before)
- `recurrenceRule` → Repeating reminders
- `repeatCount` → How many times to repeat

**Business Rules:**
1. Reminders require tasks with `dueDate` set (except CUSTOM type)
2. Deleting a task cascades deletes its reminders
3. Multiple reminders per task allowed
4. Status transitions: PENDING → FIRED/DISMISSED

**JTBD Support:**
- JTBD 2: Time awareness (S1 foundation)
- JTBD 1: Task management support

---

### 5. Status

Task status enumeration (value object, not a separate table in MVP).

| Value | Description | Transitions From |
|-------|-------------|------------------|
| **ACTIVE** | Task is pending work | - (initial), ARCHIVED |
| **COMPLETED** | Task finished | ACTIVE |
| **ARCHIVED** | Task hidden from view | ACTIVE, COMPLETED |

**Post-MVP Extensions (v1.1+):**
- **IN_PROGRESS** → Task currently being worked on
- **BLOCKED** → Waiting for dependencies
- **DEFERRED** → Postponed to later

**Business Rules:**
1. Only ACTIVE tasks appear in main list view (M4)
2. COMPLETED tasks moved to "Completed" view (M6)
3. ARCHIVED tasks hidden from all views unless explicitly shown
4. Status changes update `updatedAt` timestamp

**JTBD Support:**
- JTBD 1: Task completion workflow (M6)
- JTBD 2: Progress tracking (S2-S3)

---

## Entity Relationships

### Relationship Matrix

| Entity | Related To | Cardinality | Behavior on Delete |
|--------|-----------|-------------|-------------------|
| **Task** | Project | Many-to-One | Set projectId to NULL |
| **Task** | Tag | Many-to-Many | Remove tag from task |
| **Task** | Reminder | One-to-Many | Cascade delete reminders |
| **Project** | Task | One-to-Many | Cascade or reassign (user choice) |
| **Tag** | Task | Many-to-Many | Remove from all tasks |
| **Reminder** | Task | Many-to-One | Cascade delete |

### Relationship Details

#### Task ↔ Project
- A task belongs to zero or one project (nullable for uncategorized tasks)
- A project contains zero or more tasks
- MVP: Single-level project categorization

#### Task ↔ Tag
- A task has zero or more tags
- A tag applies to zero or more tasks
- Many-to-many implemented via `TaskTag` join table

#### Task ↔ Reminder
- A task has zero or more reminders
- A reminder belongs to exactly one task
- Cascading delete ensures no orphan reminders

---

## Lifecycle Events

### Task Lifecycle

```
┌─────────┐    Create    ┌──────────┐    Complete    ┌─────────────┐
│  None   │──────────────►│  ACTIVE  │───────────────►│ COMPLETED  │
└─────────┘               └──────────┘                └─────────────┘
                                │                           │
                                │ Archive                   │ Archive
                                ▼                           ▼
                           ┌────────────────────────────────────┐
                           │             ARCHIVED               │
                           └────────────────────────────────────┘
                                ▲                           ▲
                                │ Restore                   │ Restore
                                └───────────────────────────┘
```

**State Transitions:**
| From | To | Trigger | Validation |
|------|----|---------|------------|
| None | ACTIVE | Task creation | Title required |
| ACTIVE | COMPLETED | User marks done | - |
| ACTIVE | ARCHIVED | User archives | - |
| COMPLETED | ACTIVE | User reopens | - |
| COMPLETED | ARCHIVED | Auto-archive (30d) | - |
| ARCHIVED | ACTIVE | User restores | - |
| ARCHIVED | COMPLETED | User restores as done | - |

### Project Lifecycle

```
┌─────────┐    Create    ┌────────────┐
│  None   │──────────────►│   ACTIVE   │
└─────────┘               └────────────┘
                                │
                                │ Archive (if no active tasks)
                                ▼
                           ┌────────────┐
                           │  ARCHIVED  │
                           └────────────┘
                                ▲
                                │ Restore
                                └────────────┘
```

---

## Data Constraints & Validation

### Global Rules

| Rule | Entity | Description |
|------|--------|-------------|
| **UUID Required** | All IDs | All primary keys use UUID v4 |
| **ISO-8601 Timestamps** | All dates | All date fields in ISO-8601 format |
| **Soft Delete** | All entities | Mark deleted, don't hard delete (MVP: hard delete OK) |
| **Position Uniqueness** | Task, Project | Position values unique per collection |

### Entity-Specific Constraints

#### Task
```typescript
// Validation rules
title: { minLength: 1, maxLength: 200, required: true }
description: { maxLength: 2000, required: false }
priority: { enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' }
status: { enum: ['ACTIVE', 'COMPLETED', 'ARCHIVED'], default: 'ACTIVE' }
```

#### Project
```typescript
// Validation rules
name: { minLength: 1, maxLength: 50, required: true, unique: true }
color: { pattern: /^#[0-9A-Fa-f]{6}$/, required: true }
icon: { minLength: 1, maxLength: 10, required: true }
```

#### Tag
```typescript
// Validation rules
name: { minLength: 1, maxLength: 30, required: true, unique: true, caseInsensitive: true }
color: { pattern: /^#[0-9A-Fa-f]{6}$/, required: true }
```

#### Reminder
```typescript
// Validation rules
triggerTime: { type: 'datetime', required: true }
type: { enum: ['ON_DUE', 'BEFORE_DUE', 'CUSTOM'], required: true }
status: { enum: ['PENDING', 'FIRED', 'DISMISSED'], default: 'PENDING' }
```

---

## MVP Feature Mapping

| Feature | Entities Used | Entity Operations |
|---------|--------------|-------------------|
| **M1: Quick Task Capture** | Task, Project | Create Task (title only) |
| **M2: Task Categorization** | Task, Project | Update Task.projectId, List Projects |
| **M3: Task Prioritization** | Task | Update Task.priority, Sort Tasks by priority |
| **M4: Unified Task List View** | Task, Project, Tag | Query Tasks (filter ACTIVE, join Project, join Tags) |
| **M5: Task Details & Editing** | Task, Project, Tag | Get Task by ID, Update all fields |
| **M6: Task Completion** | Task | Update Task.status = COMPLETED |
| **M7: Basic Search & Filter** | Task, Project, Tag | Query Tasks (title/desc search, projectId filter, priority filter) |
| **M8: Data Persistence** | All entities | IndexedDB CRUD operations |

---

## Post-MVP Readiness

### Feature → Entity Extensions

| Future Feature | Entity Changes | Impact |
|----------------|----------------|--------|
| **S1: Due Dates & Reminders** | Reminder (enhanced) | Reminder entity foundation ready |
| **S2: Completed Tasks Dashboard** | Task (add completedAt) | Query COMPLETED status |
| **S3: Daily Progress Visualization** | Task (groupBy createdAt, completedAt) | No schema changes needed |
| **S4: Recurring Tasks** | Task (add recurrenceRule) | Add field, extend logic |
| **S5: Subtasks** | Task (add parentId) | Self-reference relationship |
| **S7: Task Notes** | Task (description field exists) | Already supported |
| **C1: Domain-Specific Views** | Project (add isArchived) | Add field for filtering |
| **C3: Work-Life Analytics** | Task (aggregate by project) | Query aggregation |
| **C6: Time Tracking** | Task (add estimatedTime, actualTime) | Add fields |
| **C7: Task Dependencies** | Task (add dependencies array) | Add field, validation logic |

### Migration Path

1. **MVP → v1.1**: Add `completedAt`, `recurrenceRule`, `parentId` to Task
2. **v1.1 → v1.2**: Add `isArchived` to Project, enhance Reminder
3. **v1.2 → v2.0**: Add time tracking fields, dependencies, cloud sync IDs

---

## Storage Schema (IndexedDB)

### Database Structure

```
Database: TodoAppDB
Version: 1
```

### Object Stores

| Store Name | Key Path | Indexes |
|------------|----------|---------|
| **tasks** | `id` | `status`, `projectId`, `priority`, `position`, `createdAt`, `dueDate` |
| **projects** | `id` | `position`, `createdAt` |
| **tags** | `id` | `name` (unique) |
| **reminders** | `id` | `taskId`, `triggerTime`, `status` |
| **taskTags** | Composite (`taskId`, `tagId`) | `taskId`, `tagId` |

### Index Usage

| Query | Index Used |
|-------|------------|
| Active tasks list | `tasks:status` = 'ACTIVE' |
| Tasks by project | `tasks:projectId` |
| Tasks by priority sort | `tasks:priority` |
| Pending reminders | `reminders:status` = 'PENDING', `reminders:triggerTime` |
| Tasks with tag | `taskTags:tagId` → join with tasks |
| Tag lookup by name | `tags:name` |

---

## API Operations (Data Layer)

### CRUD Operations by Entity

#### Task
```
create(data: Partial<Task>): Promise<Task>
getById(id: string): Promise<Task>
getAll(filter: TaskFilter): Promise<Task[]>
update(id: string, data: Partial<Task>): Promise<Task>
delete(id: string): Promise<void>
updatePosition(id: string, newPosition: number): Promise<void>
completeTask(id: string): Promise<Task>
restoreTask(id: string): Promise<Task>
```

#### Project
```
create(data: Partial<Project>): Promise<Project>
getById(id: string): Promise<Project>
getAll(): Promise<Project[]>
update(id: string, data: Partial<Project>): Promise<Project>
delete(id: string, reassignTo?: string): Promise<void>
```

#### Tag
```
create(data: Partial<Tag>): Promise<Tag>
getById(id: string): Promise<Tag>
getAll(): Promise<Tag[]>
update(id: string, data: Partial<Tag>): Promise<Tag>
delete(id: string): Promise<void>
addToTask(taskId: string, tagId: string): Promise<void>
removeFromTask(taskId: string, tagId: string): Promise<void>
```

#### Reminder
```
create(data: Partial<Reminder>): Promise<Reminder>
getById(id: string): Promise<Reminder>
getByTaskId(taskId: string): Promise<Reminder[]>
getPending(): Promise<Reminder[]>
markFired(id: string): Promise<Reminder>
markDismissed(id: string): Promise<Reminder>
delete(id: string): Promise<void>
```

### Filter/Query Types

```typescript
type TaskFilter = {
  status?: TaskStatus;
  projectId?: string | null;
  priority?: TaskPriority;
  tagIds?: string[];
  searchQuery?: string; // searches title and description
  dueBefore?: Date;
  dueAfter?: Date;
};

type SortOption = {
  field: 'position' | 'priority' | 'createdAt' | 'dueDate' | 'title';
  direction: 'asc' | 'desc';
};
```

---

## Sign-Off

| Role | Name | Status | Date |
|------|------|--------|------|
| Architect | [To be assigned] | ⬜ Pending | 2026-03-15 |
| Engineering Lead | [To be assigned] | ⬜ Pending | 2026-03-15 |
| Product Owner | [To be assigned] | ⬜ Pending | 2026-03-15 |

---

**Next Steps:**
1. Implement TypeScript interfaces for all entities
2. Set up IndexedDB schema migration system
3. Create data access layer (Repository pattern)
4. Implement validation layer
5. Build API service layer for UI integration
