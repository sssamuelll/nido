import { Router } from 'express';
import { getDatabase, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import { getPersonalBudgetKey, getPersonalBudgetField } from '../user-utils.js';

const router = Router();

interface HouseholdBudgetRow {
  id: number;
  household_id: number;
  total_amount: number;
  personal_samuel: number;
  personal_maria: number;
}

interface PendingApprovalRow {
  id: number;
  total_amount: number | null;
  requested_by_user_id: number;
  requested_by_username: string;
}

// GET / — returns household budget overview for the current user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const budget = await db.get<HouseholdBudgetRow>(
      'SELECT * FROM household_budget WHERE household_id = ?',
      user.household_id
    );

    if (!budget) {
      return res.json({
        id: null,
        total_amount: 2000,
        personal_samuel: 500,
        personal_maria: 500,
        personal_budget: 500,
        allocated: 0,
        unallocated: 2000,
        pending_approval: null,
      });
    }

    const personalBudgetKey = getPersonalBudgetKey(req.user as { username?: string; email?: string | null });
    const personalBudget = personalBudgetKey === 'maria' ? budget.personal_maria : budget.personal_samuel;

    const allocatedRow = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(budget_amount), 0) AS total
       FROM categories
       WHERE context = 'shared' AND owner_user_id IS NULL AND household_id = ?`,
      user.household_id
    );
    const allocated = allocatedRow?.total ?? 0;

    const pendingApproval = await db.get<PendingApprovalRow>(
      `SELECT hba.id, hba.total_amount, hba.requested_by_user_id,
              au.username AS requested_by_username
       FROM household_budget_approvals hba
       JOIN app_users au ON hba.requested_by_user_id = au.id
       WHERE hba.household_id = ? AND hba.status = 'pending'
       ORDER BY hba.created_at DESC LIMIT 1`,
      user.household_id
    );

    res.json({
      id: budget.id,
      total_amount: budget.total_amount,
      personal_samuel: budget.personal_samuel,
      personal_maria: budget.personal_maria,
      personal_budget: personalBudget,
      allocated,
      unallocated: budget.total_amount - allocated,
      pending_approval: pendingApproval ?? null,
    });
  } catch (error) {
    console.error('Error fetching household budget:', error);
    res.status(500).json({ error: 'Error al obtener presupuesto del hogar' });
  }
});

// PUT / — update household budget (personal direct, total requires approval)
router.put('/', async (req: AuthRequest, res) => {
  const { total_amount, personal_budget } = req.body;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Ensure a household_budget row exists
    await db.run(
      `INSERT OR IGNORE INTO household_budget (household_id) VALUES (?)`,
      user.household_id
    );

    const budget = await db.get<HouseholdBudgetRow>(
      'SELECT * FROM household_budget WHERE household_id = ?',
      user.household_id
    );
    if (!budget) return res.status(500).json({ error: 'Error al cargar presupuesto del hogar' });

    const personalField = getPersonalBudgetField(req.user as { username?: string; email?: string | null });

    // Handle personal budget update (direct, no approval needed)
    if (personal_budget !== undefined) {
      const field = personalField;
      await db.run(
        `UPDATE household_budget SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        personal_budget,
        budget.id
      );
    }

    let pendingApproval = false;

    // Handle total_amount change (requires partner approval)
    if (total_amount !== undefined && total_amount !== budget.total_amount) {
      // Validate: total_amount >= sum of shared category budgets
      const allocatedRow = await db.get<{ total: number }>(
        `SELECT COALESCE(SUM(budget_amount), 0) AS total
         FROM categories
         WHERE context = 'shared' AND owner_user_id IS NULL AND household_id = ?`,
        user.household_id
      );
      const allocated = allocatedRow?.total ?? 0;

      if (total_amount < allocated) {
        return res.status(400).json({
          error: `El presupuesto total (${total_amount}) no puede ser menor que lo asignado a categorías (${allocated})`,
        });
      }

      // Upsert into household_budget_approvals
      const existingPending = await db.get<{ id: number }>(
        `SELECT id FROM household_budget_approvals
         WHERE household_id = ? AND status = 'pending'`,
        user.household_id
      );

      let approvalId: number | null = null;

      if (existingPending) {
        await db.run(
          `UPDATE household_budget_approvals
           SET total_amount = ?, requested_by_user_id = ?, created_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          total_amount,
          req.user!.id,
          existingPending.id
        );
        approvalId = existingPending.id;
      } else {
        const insertResult = await db.run(
          `INSERT INTO household_budget_approvals (household_id, requested_by_user_id, total_amount)
           VALUES (?, ?, ?)`,
          user.household_id,
          req.user!.id,
          total_amount
        );
        approvalId = insertResult.lastID ?? null;
      }

      await notifyPartner(
        req.user!.id,
        req.user!.username,
        'budget_change_requested',
        'Cambio de presupuesto',
        `{name} solicita cambiar el presupuesto a €${total_amount}`,
        { approval_id: approvalId, requested_by_user_id: req.user!.id, total_amount }
      );

      pendingApproval = true;
    }

    res.json({ success: true, pending_approval: pendingApproval });
  } catch (error) {
    console.error('Error updating household budget:', error);
    res.status(500).json({ error: 'Error al actualizar presupuesto del hogar' });
  }
});

// POST /approve — approve a pending total_amount change
router.post('/approve', async (req: AuthRequest, res) => {
  const { approval_id } = req.body;
  if (!approval_id) return res.status(400).json({ error: 'Se requiere approval_id' });

  try {
    const db = getDatabase();

    const approval = await db.get<{
      id: number;
      household_id: number;
      total_amount: number | null;
      requested_by_user_id: number;
      status: string;
    }>(
      `SELECT * FROM household_budget_approvals WHERE id = ? AND status = 'pending'`,
      approval_id
    );

    if (!approval) return res.status(404).json({ error: 'Aprobación pendiente no encontrada' });

    if (approval.requested_by_user_id === req.user!.id) {
      return res.status(403).json({ error: 'No puedes aprobar tu propia solicitud' });
    }

    // Update household_budget.total_amount
    if (approval.total_amount !== null) {
      await db.run(
        `UPDATE household_budget SET total_amount = ?, updated_at = CURRENT_TIMESTAMP
         WHERE household_id = ?`,
        approval.total_amount,
        approval.household_id
      );
    }

    // Mark as approved
    await db.run(
      `UPDATE household_budget_approvals
       SET status = 'approved', approved_by_user_id = ?
       WHERE id = ?`,
      req.user!.id,
      approval_id
    );

    await notifyPartner(
      req.user!.id,
      req.user!.username,
      'budget_approved',
      'Presupuesto aprobado',
      `{name} aprobó el cambio de presupuesto a €${approval.total_amount}`,
      { approval_id, total_amount: approval.total_amount }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error approving budget:', error);
    res.status(500).json({ error: 'Error al aprobar presupuesto' });
  }
});

export default router;
