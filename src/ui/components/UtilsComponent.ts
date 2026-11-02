/**
 * Utility functions shared across components
 */

export class UtilsComponent {
  /**
   * Escapes HTML special characters to prevent XSS
   */
  static escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Detects if a string contains valid JSON
   */
  static isJsonValue(text: string): boolean {
    if (!text || text.length < 2) {
      return false;
    }
    const trimmed = text.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Tries to parse JSON string and return parsed object, or original string if not JSON
   */
  static parseJsonOrString(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
