const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('./config/db');
const { Company, Category } = require('./models');

const companySeed = {
  name: 'THE CONCEPT DESIGNERS',
  addressLine1: 'Plot 127, Siddhivinayak Township, Hirawadi',
  addressLine2: 'Nashik, 422003, India',
  city: 'Nashik',
  postalCode: '422003',
  country: 'India',
  phone: '9860416153',
  email: 'shashankss08@gmail.com',
  defaultCurrency: 'INR',
  defaultHeader: 'Quotation',
  defaultValidityDays: 7,
  defaultSalutation: 'Dear Client,',
  defaultMessage: 'Please find below a cost-breakdown for the quotation. Please consider this, and do not hesitate to contact me with any question.',
  defaultClosing: 'Many thanks,',
  defaultSignatory: 'THE CONCEPT DESIGNERS',
  pdfClosingMessage: 'Many thanks for your custom! I look forward to doing business with you.',
  quotationTerms: 'Quotation terms: Valid up to 7 days.',
  nextQuotationNumber: 372,
  nextInvoiceNumber: 1,
};

const categoryNames = [
  'Living Room',
  'Kitchen',
  'Bedroom',
  'Civil Work',
  'Electrical Work',
  'Furniture',
  'Custom Work',
];

async function seed() {
  try {
    await connectDB();

    let company = await Company.findOne().sort({ createdAt: 1 });
    if (!company) {
      company = await Company.create(companySeed);
    }

    for (const [sortOrder, name] of categoryNames.entries()) {
      await Category.updateOne(
        { companyId: company._id, name },
        { $setOnInsert: { companyId: company._id, name, sortOrder } },
        { upsert: true, runValidators: true },
      );
    }

    console.log(`Seed complete. Company "${company.name}" and ${categoryNames.length} categories are ready.`);
  } finally {
    await require('mongoose').disconnect();
  }
}

seed().catch((error) => {
  console.error('Database seed failed:', error);
  process.exitCode = 1;
});
