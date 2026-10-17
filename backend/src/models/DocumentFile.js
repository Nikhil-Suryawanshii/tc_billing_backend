const mongoose = require('mongoose');
const { Schema } = mongoose;

const documentFileSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  documentType: { type: String, enum: ['quotation', 'invoice'], required: true },
  documentId: { type: Schema.Types.ObjectId, required: true },
  path: { type: String, required: true },
  version: { type: Number, default: 1, min: 1 },
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'documentFiles' });

module.exports = mongoose.models.DocumentFile
  || mongoose.model('DocumentFile', documentFileSchema);
