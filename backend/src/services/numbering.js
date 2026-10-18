import mongoose from 'mongoose';
import Company from '../models/Company.js';

export async function takeNumber(companyId, kind, session) {
  const prefixField = kind === 'quotation' ? 'quotationPrefix' : 'invoicePrefix';
  const counterField = kind === 'quotation' ? 'nextQuotationNumber' : 'nextInvoiceNumber';
  const company = await Company.findOneAndUpdate(
    { _id: companyId },
    { $inc: { [counterField]: 1 } },
    { new: false, session }
  );
  return `${company[prefixField]} ${company[counterField]}`;
}

export async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
