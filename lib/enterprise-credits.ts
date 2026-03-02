import { db } from '@/db';
import { enterpriseCustomers, enterpriseCreditTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface DeductResult {
  success: boolean;
  remainingCredits: number;
  transactionId?: string;
}

/**
 * Atomically deduct credits from a customer using a Drizzle transaction with FOR UPDATE.
 * Call this AFTER the AI generation and upload succeed.
 */
export async function deductEnterpriseCredits(
  customerId: string,
  amount: number,
  jobId: string,
  actionType = 'api_request'
): Promise<DeductResult> {
  return await db.transaction(async (tx) => {
    // Lock the row to prevent concurrent over-deductions
    const [customer] = await tx
      .select({ creditBalance: enterpriseCustomers.creditBalance })
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, customerId))
      .for('update');

    if (!customer || customer.creditBalance < amount) {
      return { success: false, remainingCredits: customer?.creditBalance ?? 0 };
    }

    const newBalance = customer.creditBalance - amount;

    await tx
      .update(enterpriseCustomers)
      .set({ creditBalance: newBalance, updatedAt: new Date() })
      .where(eq(enterpriseCustomers.id, customerId));

    const [txn] = await tx
      .insert(enterpriseCreditTransactions)
      .values({
        customerId,
        jobId,
        amount: -amount,
        actionType,
        balanceAfter: newBalance,
      })
      .returning({ id: enterpriseCreditTransactions.id });

    return { success: true, remainingCredits: newBalance, transactionId: txn.id };
  });
}
