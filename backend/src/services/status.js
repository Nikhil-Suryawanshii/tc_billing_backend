import Quotation from '../models/Quotation.js';
import Invoice from '../models/Invoice.js';
import { d } from '../lib/money.js';
import { startOfToday } from '../lib/dates.js';

export async function refreshStatuses(companyId) {
  const today = startOfToday();
  await Quotation.updateMany(
    { companyId, status: 'Sent', validUntil: { $ne: null, $lt: today } },
    { $set: { status: 'Expired' } }
  );

  const issued = await Invoice.find({
    companyId,
    status: 'Issued',
    dueDate: { $lt: today },
  });

  for (const invoice of issued) {
    if (d(invoice.balanceDue).gt(0)) {
      invoice.status = 'Overdue';
      await invoice.save();
    }
  }
}
