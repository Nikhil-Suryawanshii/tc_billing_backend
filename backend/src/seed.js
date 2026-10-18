import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { connectDb } from './config/db.js';
import { uploadsDir } from './config/paths.js';
import Company from './models/Company.js';
import Category from './models/Category.js';
import Client from './models/Client.js';
import Quotation from './models/Quotation.js';
import { priceDocument } from './services/totals.js';

dotenv.config();

const categories = [
  'Living Room',
  'Kitchen',
  'Bedroom',
  'Civil Work',
  'Electrical Work',
  'Furniture',
  'Custom Work',
];

const companyValues = {
  name: 'THE CONCEPT DESIGNERS',
  gstNumber: '',
  addressLine1: 'Plot 127, Siddhivinayak Township, Hirawadi',
  addressLine2: 'Nashik, 422003, India',
  city: 'Nashik',
  state: 'Maharashtra',
  postalCode: '422003',
  country: 'India',
  phone: '9860416153',
  email: 'shashankss08@gmail.com',
  website: '',
  defaultCurrency: 'INR',
  defaultHeader: 'Quotation',
  defaultValidityDays: 7,
  defaultSalutation: 'Dear Client,',
  defaultMessage:
    'Please find below a cost-breakdown for the quotation. Please consider this, and do not hesitate to contact me with any question.',
  defaultClosing: 'Many thanks,',
  defaultSignatory: 'THE CONCEPT DESIGNERS',
  pdfClosingMessage: 'Many thanks for your custom! I look forward to doing business with you.',
  quotationTerms: 'Quotation terms: Valid up to 7 days.',
  invoicePaymentTerms: 'Payment is due by the invoice due date.',
  quotationPrefix: 'QUO',
  invoicePrefix: 'INV',
  nextQuotationNumber: 372,
  nextInvoiceNumber: 1,
};

export async function seed() {
  await fs.mkdir(path.join(uploadsDir, 'company'), { recursive: true });
  await fs.mkdir(path.join(uploadsDir, 'products'), { recursive: true });
  await fs.mkdir(path.join(uploadsDir, 'pdfs'), { recursive: true });

  let company = await Company.findOne();
  if (!company) {
    company = await Company.create(companyValues);
  }

  for (const [index, name] of categories.entries()) {
    await Category.updateOne(
      { companyId: company._id, name },
      {
        $setOnInsert: {
          companyId: company._id,
          name,
          description: '',
          isActive: true,
          sortOrder: index + 1,
        },
      },
      { upsert: true }
    );
  }

  await Category.collection.dropIndex('companyId_1_name_1').catch(() => {});
  await Category.syncIndexes();
  await seedGujarQuotation(company);
  return company;
}

const livingRoom = `1) Entrance Decor With Shoe rack.
2) Safety Door with All fittings.
3) Main Door Laminate Changing both Side
4) Main door Frame laminate change.
5) Full Wall Tv Set-up.
6) Corner Sofa lounge.
7) Centre Table.
8) Hydraulic Wall Mounted Dining Table.
10) French Door ( 8 x 7 feet )
11) 2 Seater Swing Fitting Anckle Fastner Fitting.
12) Hall Kitchen Round Framing.
13) False Ceiling with Kitchen.
14) All Light Fittings.
15) Wallpaper Near Dining Table.
16) Balcony 2 Way Light 2 walls.`;

const kitchen = `*Civil Work Kitchen Platform Change with wall brake and repairing.
1) Tandom Kitchen Basket - 7000 / basket. ( Slitech ) ( Laminate ).
and Other Side Doors and Shelf.
2) L shape Horizontal Crockery Unit with glass Profile Shutters for crockery Unit.
2a) 2 Open Utility Boxes.
3) Loft Storage Boxes with solid Shutters both Side.
4) Vertical Storage Unit in Balcony Full Size.
5) 2 front wicker Baskets & Oven Mixer storage with Crockery storage unit.
with Glass Door shutter
6) Modern Sitting Mandir with Storage drawer & Rangoli Tray.
7) All Light fittings with Polycab Wire.
8) Basin Storage Unit with Upper doors.`;

const bedroom = `1) One step Hydraulic Bed with Side table and Back Cushion.
2) Full wall sliding Wardrobe
3) Wardrobe Side Daily using Cloths hanging Storage unit with Dressing Table with mirror
4) Upper storage Unit.
5) simple False Ceiling above Bed design.
6) All Light Fitting and wiring.
7) Work Station and Book Shelf.
Including -
Asian Paints Royale pastle Painting.
wall Putti.
wallpaper.
Electrical work.
Electrical material.
sofa cushion and bed back rest cushion.`;

function pointItems(section, text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      sectionHeading: section,
      name,
      description: '',
      quantity: 1,
      unit: '',
      unitPrice: '0.00',
      discountAmount: '0',
      taxRate: '0',
    }));
}

async function seedSectionPoints(company, section, text) {
  const parent = await Category.findOne({ companyId: company._id, name: section, parentId: null });
  if (!parent) return;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const [index, name] of lines.entries()) {
    await Category.updateOne(
      { companyId: company._id, parentId: parent._id, name },
      {
        $setOnInsert: {
          companyId: company._id,
          parentId: parent._id,
          name,
          description: '',
          defaultPrice: '0.00',
          isActive: true,
          sortOrder: index + 1,
        },
      },
      { upsert: true }
    );
  }
}

async function seedGujarQuotation(company) {
  const clientFields = {
    companyId: company._id,
    name: 'Mr Gujar Sir',
    phone: '',
    email: '',
    attentionName: 'Mr Gujar Sir',
    billingAddress: 'Gokuldham Hirawadi',
    shippingAddress: '',
    city: 'Nashik',
    state: 'Maharashtra',
    postalCode: '422003',
    country: 'India',
  };
  let client = await Client.findOne({ companyId: company._id, name: 'Mr Gujar Sir' });
  if (!client) client = await Client.create(clientFields);
  else Object.assign(client, clientFields);

  if (client.isModified()) await client.save();

  await seedSectionPoints(company, 'Living Room', livingRoom);
  await seedSectionPoints(company, 'Kitchen', kitchen);
  await seedSectionPoints(company, 'Bedroom', bedroom);

  const existing = await Quotation.findOne({ companyId: company._id, number: 'QUO 372' });
  const keptPrices = new Map(
    (existing?.items || []).map((item) => [`${item.sectionHeading}\n${item.name}`, item.unitPrice])
  );
  const priced = priceDocument(
    [
      ...pointItems('Living Room', livingRoom),
      ...pointItems('Kitchen', kitchen),
      ...pointItems('Bedroom', bedroom),
    ].map((item) => ({
      ...item,
      unitPrice: keptPrices.get(`${item.sectionHeading}\n${item.name}`) || item.unitPrice,
    })),
    0
  );

  const quotationDate = new Date(2026, 9, 12);
  const validUntil = new Date(2026, 9, 19);
  const document = {
    companyId: company._id,
    clientId: client._id,
    number: 'QUO 372',
    poSoNumber: '',
    header: 'Quotation',
    currency: 'INR',
    quotationDate,
    validUntil,
    status: 'Sent',
    companySnapshot: {
      name: company.name,
      gstNumber: company.gstNumber,
      addressLine1: company.addressLine1,
      addressLine2: company.addressLine2,
      phone: company.phone,
      email: company.email,
      website: company.website,
      logoPath: company.logoPath,
    },
    clientSnapshot: {
      name: client.name,
      billingAddress: client.billingAddress,
      addressLine1: client.billingAddress,
      city: client.city,
      state: client.state,
      postalCode: client.postalCode,
      country: client.country,
    },
    salutation: 'Dear Mr Gujar Sir,',
    message: company.defaultMessage,
    closing: 'Many thanks,',
    signatory: 'THE CONCEPT DESIGNERS',
    terms: company.pdfClosingMessage,
    notes: '',
    validityText: company.quotationTerms,
    ...priced,
    convertedInvoiceId: null,
    archivedAt: null,
  };

  if (existing) {
    Object.assign(existing, document);
    await existing.save();
  } else {
    await Quotation.create(document);
  }

  if (company.nextQuotationNumber <= 372) {
    company.nextQuotationNumber = 373;
    await company.save();
  }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('seed.js');

if (isDirectRun) {
  connectDb()
    .then(() => seed())
    .then((company) => {
      console.log(`Seeded ${company.name}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
