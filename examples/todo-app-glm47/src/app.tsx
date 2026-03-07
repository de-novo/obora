/**
 * Application Entry Point
 * 
 * Root component that initializes the TODO application.
 * 
 * Based on: docs/10-architecture.md (Section 1)
 * - Sets up multi-tab synchronization on mount
 * - Renders the main TodoApp component
 * - Handles cleanup on unmount
 */

import React, { useEffect } from 'react';
import TodoApp from './components/TodoApp';
import { setupMultiTabSync } from './store/todoStore';

const App: React.FC = () => {
  // Set up multi-tab synchronization on mount
  useEffect(() => {
    const cleanup = setupMultiTabSync();
    
    // Cleanup event listener on unmount
    return cleanup;
  }, []);

  return (
    <div className="app">
      <TodoApp />
    </div>
  );
};

export default App;
