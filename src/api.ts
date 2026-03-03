const API_BASE = '/api';

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class Api {
  private static async request(endpoint: string, options: ApiOptions = {}) {
    const { method = 'GET', body, headers = {} } = options;

    const config: RequestInit = {
      method,
      credentials: 'include', // Important to send cookies
      headers: {
        'Content-Type': 'application/json',
        'x-nido-request': 'true', // Added for CSRF protection
        ...headers,
      },
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, errorData.error || 'Request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  }

  // Auth
  static async login(username: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  static async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  static async verifyPin(pin: string) {
    return this.request('/auth/verify-pin', {
      method: 'POST',
      body: { pin },
    });
  }

  static async updatePin(pin: string) {
    return this.request('/auth/update-pin', {
      method: 'POST',
      body: { pin },
    });
  }

  // Expenses
  static async getExpenses(month: string) {
    return this.request(`/expenses?month=${month}`);
  }

  static async createExpense(expense: {
    description: string;
    amount: number;
    category: string;
    date: string;
    paid_by?: string;
    type: string;
    status?: string;
  }) {
    return this.request('/expenses', {
      method: 'POST',
      body: expense,
    });
  }

  static async updateExpense(id: number, expense: any) {
    return this.request(`/expenses/${id}`, {
      method: 'PUT',
      body: expense,
    });
  }

  static async deleteExpense(id: number) {
    return this.request(`/expenses/${id}`, {
      method: 'DELETE',
    });
  }

  static async getSummary(month: string) {
    return this.request(`/expenses/summary?month=${month}`);
  }

  static async getCategories(): Promise<string[]> {
    return this.request('/expenses/categories');
  }

  // Budgets
  static async getBudget(month: string) {
    return this.request(`/budgets?month=${month}`);
  }

  static async updateBudget(budget: {
    month: string;
    total_budget: number;
    rent: number;
    savings: number;
    personal_samuel: number;
    personal_maria: number;
  }) {
    return this.request('/budgets', {
      method: 'PUT',
      body: budget,
    });
  }

  // Health check
  static async health() {
    return this.request('/health');
  }
}

export { ApiError };