import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY_DEFAULT = 50;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * useUndoRedo - Undo/redo hook for stateful edits.
 *
 * @param {any} initialState - Initial state (must be JSON-serializable)
 * @param {number} maxHistory - Max undo steps (default 50)
 * @returns {{ state, setState, setStateWithUndo, undo, redo, canUndo, canRedo, reset }}
 */
export function useUndoRedo(initialState, maxHistory = MAX_HISTORY_DEFAULT) {
  const [state, setState] = useState(initialState);
  const [historyVersion, setHistoryVersion] = useState(0);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const notifyHistoryChange = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  const setStateWithUndo = useCallback(
    (updaterOrValue) => {
      const nextState =
        typeof updaterOrValue === 'function' ? updaterOrValue(state) : updaterOrValue;
      const snapshot = deepClone(state);
      undoStackRef.current = [...undoStackRef.current.slice(-(maxHistory - 1)), snapshot];
      redoStackRef.current = [];
      setState(nextState);
      notifyHistoryChange();
    },
    [state, maxHistory, notifyHistoryChange]
  );

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    redoStackRef.current = [...redoStackRef.current, deepClone(state)];
    setState(prev);
    notifyHistoryChange();
  }, [state, notifyHistoryChange]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    undoStackRef.current = [...undoStackRef.current, deepClone(state)];
    setState(next);
    notifyHistoryChange();
  }, [state, notifyHistoryChange]);

  const reset = useCallback(
    (newState) => {
      setState(newState);
      undoStackRef.current = [];
      redoStackRef.current = [];
      notifyHistoryChange();
    },
    [notifyHistoryChange]
  );

  return {
    state,
    setState,
    setStateWithUndo,
    undo,
    redo,
    reset,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
