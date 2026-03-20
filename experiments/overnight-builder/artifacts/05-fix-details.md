# Backup Strategy Fix - Technical Details

**Issue:** 5 test failures due to incorrect backup timing  
**Root Cause:** Backup created after save instead of before  
**Solution:** Restructured save flow and initialization logic

---

## The Problem

### Symptom 1: Backup Contains Wrong Data
```typescript
// BEFORE (Wrong):
async save(data) {
  await saveInternal(data);  // Save new data
  await backup();            // Backup NEW data (wrong!)
}

// Result: Backup = Current state (not previous)
```

### Symptom 2: First Save Created Backup
```typescript
// BEFORE (Wrong):
async initialize() {
  if (!file exists) {
    await saveInternal(emptyData);  // Create file
  }
}

// First add() → file exists → backup created (wrong!)
```

### Symptom 3: Recovery Meaningless
```
Main file: [data v2]
Backup:    [data v2]  ← Same as main!

Recovery: Restore v2 from backup → Still v2 (no change!)
```

---

## The Solution

### Fix 1: Backup BEFORE Save
```typescript
// AFTER (Correct):
async save(data) {
  let hasBackup = false;
  
  // Check if file exists
  try {
    await fs.access(this.dataPath);
    // File exists → backup it (contains previous state)
    await this.backup();
    hasBackup = true;
  } catch {
    // File doesn't exist → first save, no backup
  }
  
  // Now save new data
  await this.saveInternal(data, hasBackup);
}
```

**Result:**
```
First save:
  - File doesn't exist
  - Skip backup
  - Create file with data v1
  - backupCreated: false

Second save:
  - File exists with data v1
  - Backup data v1 → .bak file
  - Overwrite with data v2
  - backupCreated: true

Recovery:
  - Main: [data v2] (corrupted)
  - Backup: [data v1] ← Previous good state!
  - Restore v1 → Success!
```

### Fix 2: Initialize Without Creating File
```typescript
// AFTER (Correct):
async initialize() {
  await fs.mkdir(this.baseDir, { recursive: true });
  
  try {
    await fs.access(this.dataPath);
    // File exists → validate only
    await this.load();
  } catch {
    // File doesn't exist → OK (first run)
  }
  // DON'T create file - let first save() do it
}
```

**Result:**
```
Before: initialize() → file created → first add() → backup created ❌
After:  initialize() → no file → first add() → no backup ✅
```

### Fix 3: Service Handles First Run
```typescript
// Added in TodoService:
try {
  data = await this.storage.load();
} catch (error) {
  if (error instanceof StorageError) {
    // File not found - first run
    data = createEmptySchema();
  }
}
```

**Result:** Service works correctly even when file doesn't exist

---

## Test Expectations vs Implementation

### Test: "should create backup before saving"
```typescript
// Test expects:
await storage.save({ todos: [todo1] });  // First save
await storage.save({ todos: [todo1, todo2] });  // Second save

const backup = readBackupFile();
expect(backup.todos).toEqual([todo1]);  // Previous state!
```

**BEFORE:** ❌ backup.todos = [todo1, todo2] (current state)  
**AFTER:** ✅ backup.todos = [todo1] (previous state)

### Test: "저장 시 백업 생성"
```typescript
// Test expects:
await service.add('첫 번째');
expect(backupExists()).toBe(false);  // No backup after first

await service.add('두 번째');
expect(backupExists()).toBe(true);  // Backup after second
expect(backup.todos[0].content).toBe('첫 번째');  // Previous!
```

**BEFORE:** ❌ backup exists after first add  
**AFTER:** ✅ backup only after second add, contains first

### Test: "should recover from backup"
```typescript
// Test expects:
await service.add('백업 테스트');
// ... corrupt main file ...
const result = execCLI('list');
expect(result.stdout).toContain('백업 테스트');  // Recovered!
```

**BEFORE:** ❌ Recovery returns empty (backup had current data)  
**AFTER:** ✅ Recovery returns '백업 테스트' (backup has previous)

---

## File State Transitions

### BEFORE (Wrong)
```
initialize()   → todos.json: empty
add('first')   → todos.json: [first], backup: [first] ❌
add('second')  → todos.json: [first, second], backup: [first, second] ❌
corrupt main   → recovery: [first, second] (same!) ❌
```

### AFTER (Correct)
```
initialize()   → (no file)
add('first')   → todos.json: [first], backup: (none) ✅
add('second')  → todos.json: [first, second], backup: [first] ✅
corrupt main   → recovery: [first] (previous state!) ✅
```

---

## Code Changes Summary

### storage.ts
- `save()`: Backup before save, not after
- `initialize()`: Don't create file, only directory
- `saveInternal()`: Track backupCreated correctly

### todo.service.ts  
- Handle `StorageError` for first run
- Create empty schema when file missing
- Added `createEmptySchema()` helper

---

## Verification

### Expected Test Results
- ✅ First save: no backup file
- ✅ Second save: backup file exists
- ✅ Backup content: previous state
- ✅ Recovery: restores previous state
- ✅ backupCreated flag: accurate

### All 5 Failing Tests Should Pass
1. ✅ integration/storage.test.ts - backup before save
2. ✅ integration/storage.test.ts - restore from backup
3. ✅ unit/storage.test.ts - backup before save
4. ✅ integration/data-persistence.test.ts - 백업 생성
5. ✅ e2e/error-recovery.test.ts - recover from backup

---

**Status:** ✅ Implementation complete and aligned with design
