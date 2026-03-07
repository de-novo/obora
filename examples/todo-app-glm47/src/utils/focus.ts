/**
 * Focus management utilities for TODO Application
 */

/**
 * Save the currently focused element
 */
let savedFocusElement: HTMLElement | null = null;

export const saveFocus = (): void => {
  savedFocusElement = document.activeElement as HTMLElement;
};

/**
 * Restore focus to the previously saved element
 */
export const restoreFocus = (): void => {
  if (savedFocusElement && typeof savedFocusElement.focus === 'function') {
    savedFocusElement.focus();
    savedFocusElement = null;
  }
};

/**
 * Focus the next element in tab order
 */
export const focusNext = (currentElement: HTMLElement): void => {
  const focusableElements = getFocusableElements();
  const currentIndex = focusableElements.indexOf(currentElement);
  
  if (currentIndex !== -1 && currentIndex < focusableElements.length - 1) {
    focusableElements[currentIndex + 1].focus();
  }
};

/**
 * Focus the previous element in tab order
 */
export const focusPrevious = (currentElement: HTMLElement): void => {
  const focusableElements = getFocusableElements();
  const currentIndex = focusableElements.indexOf(currentElement);
  
  if (currentIndex > 0) {
    focusableElements[currentIndex - 1].focus();
  }
};

/**
 * Get all focusable elements in the document
 */
const getFocusableElements = (): HTMLElement[] => {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(document.querySelectorAll<HTMLElement>(focusableSelectors));
};

/**
 * Trap focus within a container (for modals)
 */
export class FocusTrap {
  private container: HTMLElement | null = null;
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private boundHandler: ((e: KeyboardEvent) => void) | null = null;

  activate(container: HTMLElement): void {
    this.container = container;
    this.previousFocus = document.activeElement as HTMLElement;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    this.firstFocusable = focusableElements[0] || null;
    this.lastFocusable = focusableElements[focusableElements.length - 1] || null;

    // Focus first element
    if (this.firstFocusable) {
      this.firstFocusable.focus();
    }

    // Bind keyboard handler
    this.boundHandler = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.boundHandler);
  }

  deactivate(): void {
    if (this.boundHandler) {
      document.removeEventListener('keydown', this.boundHandler);
      this.boundHandler = null;
    }

    // Restore previous focus
    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      this.previousFocus.focus();
    }

    this.container = null;
    this.firstFocusable = null;
    this.lastFocusable = null;
    this.previousFocus = null;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;

    if (!this.firstFocusable || !this.lastFocusable) return;

    if (e.shiftKey) {
      // Shift+Tab
      if (document.activeElement === this.firstFocusable) {
        e.preventDefault();
        this.lastFocusable.focus();
      }
    } else {
      // Tab
      if (document.activeElement === this.lastFocusable) {
        e.preventDefault();
        this.firstFocusable.focus();
      }
    }
  };
}

export const focusTrap = new FocusTrap();
