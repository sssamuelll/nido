const API_BASE = '/api';

interface ApiOptions {
  method?: string;
  body?: Record<string, unknown>;
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

  static async confirmMagicLink(tokenHash: string, type: string) {
    return this.request('/auth/magic-link/confirm', {
      method: 'POST',
      body: { tokenHash, type },
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

  static async updateExpense(id: number, expense: {
    description: string;
    amount: number;
    category: string;
    date: string;
    type: string;
    status?: string;
  }) {
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

  static async getCategories(context: 'shared' | 'personal' = 'shared'): Promise<Array<{ id: number; name: string; emoji: string; color: string }>> {
    return this.request(`/categories?context=${context}`);
  }

  static async saveCategory(category: { id?: number; name: string; emoji: string; color: string; context?: 'shared' | 'personal' }) {
    return this.request('/categories', {
      method: 'POST',
      body: category,
    });
  }

  static async deleteCategory(id: number) {
    return this.request(`/categories/${id}`, {
      method: 'DELETE',
    });
  }

  static async getBudget(month: string) {
    return this.request(`/budgets?month=${month}`);
  }

  static async updateBudget(budget: {
    month: string;
    shared_available?: number;
    personal_budget?: number;
    categories?: Record<string, number>;
    context?: 'shared' | 'personal';
  }) {
    return this.request('/budgets', {
      method: 'PUT',
      body: budget,
    });
  }

  static async approveBudget(approvalId: number) {
    return this.request('/budgets/approve', {
      method: 'POST',
      body: { approval_id: approvalId },
    });
  }

  static async getMembers(): Promise<Array<{ id: number; username: string }>> {
    return this.request('/household/members');
  }

  static async getGoals() {
    return this.request('/goals');
  }

  static async createGoal(data: { name: string; icon?: string; target: number; deadline?: string; owner_type: 'shared' | 'personal' }) {
    return this.request('/goals', { method: 'POST', body: data });
  }

  static async updateGoal(id: number, data: Partial<{ name: string; icon: string; target: number; deadline: string | null }>) {
    return this.request(`/goals/${id}`, { method: 'PUT', body: data });
  }

  static async deleteGoal(id: number) {
    return this.request(`/goals/${id}`, { method: 'DELETE' });
  }

  static async contributeToGoal(id: number, amount: number) {
    return this.request(`/goals/${id}/contribute`, { method: 'POST', body: { amount } });
  }

  static async getAnalytics(months: number, context: 'shared' | 'personal') {
    return this.request(`/analytics?months=${months}&context=${context}`);
  }

  static async getNotifications() {
    return this.request('/notifications');
  }

  static async markNotificationAsRead(id: number) {
    return this.request(`/notifications/${id}/read`, { method: 'PUT' });
  }

  static async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  static async health() {
    return this.request('/health');
  }

  // Recurring expenses
  static async getRecurring() { return this.request('/recurring'); }
  static async createRecurring(data: { name: string; emoji: string; amount: number; category: string; type: string; notes?: string }) {
    return this.request('/recurring', { method: 'POST', body: data });
  }
  static async updateRecurring(id: number, data: Record<string, unknown>) {
    return this.request(`/recurring/${id}`, { method: 'PUT', body: data });
  }
  static async deleteRecurring(id: number) { return this.request(`/recurring/${id}`, { method: 'DELETE' }); }
  static async togglePauseRecurring(id: number) { return this.request(`/recurring/${id}/pause`, { method: 'PUT' }); }

  // Billing cycles
  static async getCurrentCycle() { return this.request('/cycles/current'); }
  static async requestCycle() { return this.request('/cycles/request', { method: 'POST' }); }
  static async approveCycle(cycleId: number) { return this.request('/cycles/approve', { method: 'POST', body: { cycle_id: cycleId } }); }
}

export { ApiError };
