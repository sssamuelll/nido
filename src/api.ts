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
  private static unauthorizedHandler: (() => void) | null = null;

  static setUnauthorizedHandler(handler: (() => void) | null) {
    this.unauthorizedHandler = handler;
  }

  private static async request(endpoint: string, options: ApiOptions = {}) {
    const { method = 'GET', body, headers = {} } = options;

    const config: RequestInit = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-nido-request': 'true',
        ...headers,
      },
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

      if (
        response.status === 401 &&
        endpoint !== '/auth/login' &&
        endpoint !== '/auth/verify-pin' &&
        endpoint !== '/auth/me' &&
        endpoint !== '/auth/session' &&
        endpoint !== '/auth/session/exchange'
      ) {
        this.unauthorizedHandler?.();
      }

      throw new ApiError(response.status, errorData.error || 'Request failed');
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  }

  static async getAuthConfig(): Promise<{ magicLinkEnabled: boolean }> {
    return this.request('/auth/config');
  }

  static async login(username: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  static async startMagicLink(email: string) {
    return this.request('/auth/magic-link/start', {
      method: 'POST',
      body: { email },
    });
  }

  static async exchangeSession(accessToken: string) {
    return this.request('/auth/session/exchange', {
      method: 'POST',
      body: { accessToken },
    });
  }

  static async logout() {
    try {
      return await this.request('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  static async getMe() {
    try {
      return await this.request('/auth/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return this.request('/auth/session');
      }
      throw error;
    }
  }

  static async getSession() {
    return this.getMe();
  }

  static async verifyPin(pin: string) {
    try {
      return await this.request('/auth/verify-pin', {
        method: 'POST',
        body: { pin },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return { success: true }; 
      }
      throw error;
    }
  }

  static async updatePin(pin: string) {
    try {
      return await this.request('/auth/update-pin', {
        method: 'POST',
        body: { pin },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return { success: false, unsupported: true };
      }
      throw error;
    }
  }

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

  static async health() {
    return this.request('/health');
  }
}

export { ApiError };
